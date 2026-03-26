import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Job } from 'bullmq';
import { EventSyncProcessor } from './event-sync.processor';
import { DeadLetterService } from './dead-letter.service';
import { StellarService } from '../stellar/stellar.service';
import { NotificationsService } from '../notification/notifications.service';
import { Group } from '../groups/entities/group.entity';
import { GroupStatus } from '../groups/entities/group-status.enum';
import { Contribution } from '../contributions/entities/contribution.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { JOB_NAMES, QUEUE_NAMES } from './queue.constants';
import { NotificationType } from '../notification/notification-type.enum';

const makeJob = (name: string, data: unknown, overrides: Partial<Job> = {}): Job =>
  ({ id: 'evt-job-id', name, data, attemptsMade: 0, opts: { attempts: 3 }, ...overrides }) as unknown as Job;

const GROUP_ID = 'group-uuid';
const USER_ID = 'user-uuid';
const CONTRACT = '0xcontract';
const TX = '0xabc123';
const WALLET = 'GWALLETADDRESS';

const activeGroup: Partial<Group> = {
  id: GROUP_ID,
  contractAddress: CONTRACT,
  status: GroupStatus.ACTIVE,
  currentRound: 1,
  name: 'Test Group',
  contributionAmount: '100',
};

const activeMembership: Partial<Membership> = {
  id: 'mem-uuid',
  groupId: GROUP_ID,
  userId: USER_ID,
  walletAddress: WALLET,
  hasPaidCurrentRound: false,
  hasReceivedPayout: false,
  contributionsMade: 0,
};

describe('EventSyncProcessor', () => {
  let processor: EventSyncProcessor;
  let deadLetterService: jest.Mocked<DeadLetterService>;
  let stellarService: jest.Mocked<StellarService>;
  let notificationsService: jest.Mocked<NotificationsService>;
  let groupRepo: { findOne: jest.Mock; save: jest.Mock };
  let contributionRepo: { findOne: jest.Mock; create: jest.Mock; save: jest.Mock };
  let membershipRepo: { findOne: jest.Mock; save: jest.Mock };

  beforeEach(async () => {
    groupRepo = { findOne: jest.fn(), save: jest.fn() };
    contributionRepo = { findOne: jest.fn(), create: jest.fn(), save: jest.fn() };
    membershipRepo = { findOne: jest.fn(), save: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventSyncProcessor,
        { provide: DeadLetterService, useValue: { moveToDeadLetter: jest.fn().mockResolvedValue(undefined) } },
        { provide: StellarService, useValue: { getGroupState: jest.fn() } },
        { provide: NotificationsService, useValue: { notify: jest.fn().mockResolvedValue({}) } },
        { provide: getRepositoryToken(Group), useValue: groupRepo },
        { provide: getRepositoryToken(Contribution), useValue: contributionRepo },
        { provide: getRepositoryToken(Membership), useValue: membershipRepo },
      ],
    }).compile();

    processor = module.get(EventSyncProcessor);
    deadLetterService = module.get(DeadLetterService);
    stellarService = module.get(StellarService);
    notificationsService = module.get(NotificationsService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── SYNC_ON_CHAIN_EVENT ────────────────────────────────────────────────────

  describe('SYNC_ON_CHAIN_EVENT', () => {
    const jobData = { contractAddress: CONTRACT, chainId: 1, eventName: 'StateChanged', transactionHash: TX, blockNumber: 1, logIndex: 0, rawData: {} };

    it('reconciles currentRound and status from on-chain state', async () => {
      groupRepo.findOne.mockResolvedValue({ ...activeGroup });
      stellarService.getGroupState.mockResolvedValue({ current_round: 2, status: 'ACTIVE' });
      groupRepo.save.mockResolvedValue({});

      await processor.process(makeJob(JOB_NAMES.SYNC_ON_CHAIN_EVENT, jobData));

      expect(stellarService.getGroupState).toHaveBeenCalledWith(CONTRACT);
      expect(groupRepo.save).toHaveBeenCalledWith(expect.objectContaining({ currentRound: 2 }));
    });

    it('skips save when state is already in sync', async () => {
      groupRepo.findOne.mockResolvedValue({ ...activeGroup, currentRound: 1 });
      stellarService.getGroupState.mockResolvedValue({ current_round: 1, status: 'ACTIVE' });

      await processor.process(makeJob(JOB_NAMES.SYNC_ON_CHAIN_EVENT, jobData));

      expect(groupRepo.save).not.toHaveBeenCalled();
    });

    it('skips when no group found for contract', async () => {
      groupRepo.findOne.mockResolvedValue(null);

      await processor.process(makeJob(JOB_NAMES.SYNC_ON_CHAIN_EVENT, jobData));

      expect(stellarService.getGroupState).not.toHaveBeenCalled();
    });
  });

  // ── PROCESS_TRANSFER_EVENT ─────────────────────────────────────────────────

  describe('PROCESS_TRANSFER_EVENT', () => {
    const jobData = { from: '0xsender', to: WALLET, amount: '100', transactionHash: TX, blockNumber: 1, tokenAddress: '0xtoken', chainId: 1 };

    it('creates a Contribution and marks membership as paid', async () => {
      contributionRepo.findOne.mockResolvedValue(null);
      membershipRepo.findOne.mockResolvedValue({ ...activeMembership });
      groupRepo.findOne.mockResolvedValue({ ...activeGroup });
      contributionRepo.create.mockReturnValue({ id: 'contrib-uuid' });
      contributionRepo.save.mockResolvedValue({ id: 'contrib-uuid' });
      membershipRepo.save.mockResolvedValue({});

      await processor.process(makeJob(JOB_NAMES.PROCESS_TRANSFER_EVENT, jobData));

      expect(contributionRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ transactionHash: TX, walletAddress: WALLET, roundNumber: 1 }),
      );
      expect(contributionRepo.save).toHaveBeenCalled();
      expect(membershipRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ hasPaidCurrentRound: true, contributionsMade: 1 }),
      );
    });

    it('is idempotent — skips if contribution already exists', async () => {
      contributionRepo.findOne.mockResolvedValue({ id: 'existing' });

      await processor.process(makeJob(JOB_NAMES.PROCESS_TRANSFER_EVENT, jobData));

      expect(contributionRepo.create).not.toHaveBeenCalled();
    });

    it('skips when no membership found for wallet', async () => {
      contributionRepo.findOne.mockResolvedValue(null);
      membershipRepo.findOne.mockResolvedValue(null);

      await processor.process(makeJob(JOB_NAMES.PROCESS_TRANSFER_EVENT, jobData));

      expect(contributionRepo.create).not.toHaveBeenCalled();
    });
  });

  // ── PROCESS_APPROVAL_EVENT ─────────────────────────────────────────────────

  describe('PROCESS_APPROVAL_EVENT', () => {
    const jobData = { owner: WALLET, spender: CONTRACT, amount: '500', transactionHash: TX, blockNumber: 1, tokenAddress: '0xtoken', chainId: 1 };

    it('marks payout received and emits PAYOUT_RECEIVED notification', async () => {
      membershipRepo.findOne.mockResolvedValue({ ...activeMembership });
      groupRepo.findOne.mockResolvedValue({ ...activeGroup });
      membershipRepo.save.mockResolvedValue({});

      await processor.process(makeJob(JOB_NAMES.PROCESS_APPROVAL_EVENT, jobData));

      expect(membershipRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ hasReceivedPayout: true, transactionHash: TX }),
      );
      expect(notificationsService.notify).toHaveBeenCalledWith(
        expect.objectContaining({ type: NotificationType.PAYOUT_RECEIVED, userId: USER_ID }),
      );
    });

    it('skips if payout already recorded', async () => {
      membershipRepo.findOne.mockResolvedValue({ ...activeMembership, hasReceivedPayout: true });
      groupRepo.findOne.mockResolvedValue({ ...activeGroup });

      await processor.process(makeJob(JOB_NAMES.PROCESS_APPROVAL_EVENT, jobData));

      expect(membershipRepo.save).not.toHaveBeenCalled();
      expect(notificationsService.notify).not.toHaveBeenCalled();
    });
  });

  // ── Unknown job ────────────────────────────────────────────────────────────

  it('throws for unknown job name', async () => {
    await expect(processor.process(makeJob('mystery-event', {}))).rejects.toThrow(
      'Unknown event-sync job type: mystery-event',
    );
  });

  // ── DLQ handling ───────────────────────────────────────────────────────────

  describe('onFailed()', () => {
    it('does NOT move to DLQ when retries remain', async () => {
      const job = makeJob(JOB_NAMES.SYNC_ON_CHAIN_EVENT, {}, { attemptsMade: 2, opts: { attempts: 3 } } as any);
      await processor.onFailed(job, new Error('timeout'));
      expect(deadLetterService.moveToDeadLetter).not.toHaveBeenCalled();
    });

    it('moves to DLQ after max retries exhausted', async () => {
      const job = makeJob(JOB_NAMES.SYNC_ON_CHAIN_EVENT, {}, { attemptsMade: 3, opts: { attempts: 3 } } as any);
      await processor.onFailed(job, new Error('permanent failure'));
      expect(deadLetterService.moveToDeadLetter).toHaveBeenCalledWith(job, expect.any(Error), QUEUE_NAMES.EVENT_SYNC);
    });
  });
});
