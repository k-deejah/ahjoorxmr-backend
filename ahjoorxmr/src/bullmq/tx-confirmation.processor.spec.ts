import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { TxConfirmationProcessor, TxConfirmationJobData } from './tx-confirmation.processor';
import { Contribution, ContributionStatus } from '../contributions/entities/contribution.entity';
import { StellarService } from '../stellar/stellar.service';
import { NotificationsService } from '../notification/notifications.service';
import { RedisService } from '../common/redis/redis.service';
import { NotificationType } from '../notification/notification-type.enum';

const mockContributionRepo = {
  update: jest.fn(),
};

const mockStellarService = {
  getTransactionStatus: jest.fn(),
};

const mockNotificationsService = {
  notify: jest.fn(),
};

const mockRedisService = {
  setIfNotExistsWithExpiry: jest.fn(),
  del: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string, def: any) => {
    if (key === 'TX_CONFIRMATION_TIMEOUT_MS') return 10_000;
    return def;
  }),
};

function makeJob(data: Partial<TxConfirmationJobData> = {}) {
  return {
    id: 'job-1',
    data: {
      contributionId: 'contrib-1',
      transactionHash: 'abc123',
      userId: 'user-1',
      deadline: Date.now() + 10_000,
      ...data,
    },
  } as any;
}

describe('TxConfirmationProcessor', () => {
  let processor: TxConfirmationProcessor;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockRedisService.setIfNotExistsWithExpiry.mockResolvedValue(true);
    mockRedisService.del.mockResolvedValue(1);
    mockNotificationsService.notify.mockResolvedValue({});
    mockContributionRepo.update.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TxConfirmationProcessor,
        { provide: getRepositoryToken(Contribution), useValue: mockContributionRepo },
        { provide: StellarService, useValue: mockStellarService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: RedisService, useValue: mockRedisService },
        { provide: ConfigService, useValue: mockConfigService },
      ],
    }).compile();

    processor = module.get(TxConfirmationProcessor);
  });

  describe('SUCCESS scenario', () => {
    it('sets status to CONFIRMED and emits notification', async () => {
      mockStellarService.getTransactionStatus.mockResolvedValue('CONFIRMED');

      await processor.process(makeJob());

      expect(mockContributionRepo.update).toHaveBeenCalledWith('contrib-1', {
        status: ContributionStatus.CONFIRMED,
      });
      expect(mockNotificationsService.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          type: NotificationType.PAYOUT_RECEIVED,
        }),
      );
    });
  });

  describe('FAILED scenario', () => {
    it('sets status to FAILED and emits notification', async () => {
      mockStellarService.getTransactionStatus.mockResolvedValue('FAILED');

      await processor.process(makeJob());

      expect(mockContributionRepo.update).toHaveBeenCalledWith('contrib-1', {
        status: ContributionStatus.FAILED,
      });
      expect(mockNotificationsService.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          type: NotificationType.SYSTEM_ALERT,
        }),
      );
    });
  });

  describe('timeout scenario', () => {
    it('sets status to FAILED when deadline expires', async () => {
      mockStellarService.getTransactionStatus.mockResolvedValue('PENDING');

      // Set deadline already in the past
      const job = makeJob({ deadline: Date.now() - 1 });
      await processor.process(job);

      expect(mockContributionRepo.update).toHaveBeenCalledWith('contrib-1', {
        status: ContributionStatus.FAILED,
      });
      expect(mockNotificationsService.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          metadata: expect.objectContaining({ timedOut: true }),
        }),
      );
    });
  });

  describe('duplicate deduplication', () => {
    it('skips processing when Redis lock is already held', async () => {
      mockRedisService.setIfNotExistsWithExpiry.mockResolvedValue(false);

      await processor.process(makeJob());

      expect(mockStellarService.getTransactionStatus).not.toHaveBeenCalled();
      expect(mockContributionRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('Redis lock cleanup', () => {
    it('releases lock even when processing throws', async () => {
      mockStellarService.getTransactionStatus.mockRejectedValue(new Error('RPC error'));

      // With a past deadline the loop exits immediately after one failed poll
      const job = makeJob({ deadline: Date.now() + 100 });
      await processor.process(job);

      expect(mockRedisService.del).toHaveBeenCalledWith('tx_confirm:abc123');
    });
  });
});
