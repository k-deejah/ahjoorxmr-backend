import { Test, TestingModule } from '@nestjs/testing';
import { TooManyRequestsException } from '@nestjs/common';
import { GdprService } from './gdpr.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { User } from './entities/user.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { RedisService } from '../common/redis/redis.service';
import { GDPR_QUEUE_NAME, GDPR_JOB_NAMES } from './gdpr.constants';
import { createHash } from 'crypto';

const mockUser: Partial<User> = {
  id: 'user-uuid-1',
  email: 'test@example.com',
  walletAddress: 'GABC123',
  firstName: 'John',
  lastName: 'Doe',
};

const mockUserRepo = {
  findOne: jest.fn().mockResolvedValue(mockUser),
  update: jest.fn().mockResolvedValue(undefined),
};

const mockAuditRepo = {
  create: jest.fn().mockImplementation((d) => d),
  save: jest.fn().mockResolvedValue({}),
};

const mockQueue = {
  add: jest.fn().mockResolvedValue({ id: 'job-1' }),
};

const mockRedis = {
  exists: jest.fn().mockResolvedValue(false),
  setWithExpiry: jest.fn().mockResolvedValue(undefined),
  ttl: jest.fn().mockResolvedValue(0),
};

describe('GdprService', () => {
  let service: GdprService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GdprService,
        { provide: getRepositoryToken(User), useValue: mockUserRepo },
        { provide: getRepositoryToken(AuditLog), useValue: mockAuditRepo },
        { provide: getQueueToken(GDPR_QUEUE_NAME), useValue: mockQueue },
        { provide: RedisService, useValue: mockRedis },
      ],
    }).compile();

    service = module.get<GdprService>(GdprService);
  });

  describe('requestDataExport', () => {
    it('should log DATA_EXPORT audit event and enqueue job', async () => {
      await service.requestDataExport('user-uuid-1', '127.0.0.1');

      expect(mockAuditRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DATA_EXPORT', userId: 'user-uuid-1' }),
      );
      expect(mockQueue.add).toHaveBeenCalledWith(
        GDPR_JOB_NAMES.DATA_EXPORT,
        { userId: 'user-uuid-1' },
        expect.any(Object),
      );
    });
  });

  describe('requestErasure', () => {
    it('should log DATA_ERASURE audit event and enqueue job', async () => {
      await service.requestErasure('user-uuid-1', '127.0.0.1');

      expect(mockAuditRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ action: 'DATA_ERASURE', userId: 'user-uuid-1' }),
      );
      expect(mockQueue.add).toHaveBeenCalledWith(
        GDPR_JOB_NAMES.RIGHT_TO_ERASURE,
        { userId: 'user-uuid-1' },
        expect.any(Object),
      );
    });

    it('should throw TooManyRequestsException when on cooldown', async () => {
      mockRedis.exists.mockResolvedValueOnce(true);
      mockRedis.ttl.mockResolvedValueOnce(86400 * 15);

      await expect(
        service.requestErasure('user-uuid-1', '127.0.0.1'),
      ).rejects.toThrow(TooManyRequestsException);
    });

    it('should set 30-day cooldown in Redis after erasure request', async () => {
      await service.requestErasure('user-uuid-1', '127.0.0.1');

      expect(mockRedis.setWithExpiry).toHaveBeenCalledWith(
        'gdpr:erasure:cooldown:user-uuid-1',
        '1',
        30 * 24 * 60 * 60,
      );
    });
  });

  describe('anonymizeUser', () => {
    it('should hash email with SHA-256 and redact walletAddress', async () => {
      await service.anonymizeUser('user-uuid-1');

      const expectedHash = createHash('sha256')
        .update('test@example.com')
        .digest('hex');

      expect(mockUserRepo.update).toHaveBeenCalledWith(
        'user-uuid-1',
        expect.objectContaining({
          email: expectedHash,
          walletAddress: 'REDACTED_user-uui',
          firstName: null,
          lastName: null,
        }),
      );
    });

    it('should set isActive to false after anonymization', async () => {
      await service.anonymizeUser('user-uuid-1');

      expect(mockUserRepo.update).toHaveBeenCalledWith(
        'user-uuid-1',
        expect.objectContaining({ isActive: false }),
      );
    });
  });
});
