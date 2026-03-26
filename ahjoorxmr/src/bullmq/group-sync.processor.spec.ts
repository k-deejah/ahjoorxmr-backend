import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { GroupSyncProcessor } from './group-sync.processor';
import { DeadLetterService } from './dead-letter.service';
import { StellarService } from '../stellar/stellar.service';
import { Group } from '../groups/entities/group.entity';
import { GroupStatus } from '../groups/entities/group-status.enum';
import { JOB_NAMES, QUEUE_NAMES } from './queue.constants';

const makeJob = (name: string, data: unknown, overrides: Partial<Job> = {}): Job =>
  ({ id: 'grp-job-id', name, data, attemptsMade: 0, opts: { attempts: 3 }, ...overrides }) as unknown as Job;

const GROUP_ID = 'group-uuid';
const CONTRACT = '0xcontract';

const activeGroup: Partial<Group> = {
  id: GROUP_ID,
  contractAddress: CONTRACT,
  status: GroupStatus.ACTIVE,
  currentRound: 1,
  staleAt: null,
};

describe('GroupSyncProcessor', () => {
  let processor: GroupSyncProcessor;
  let deadLetterService: jest.Mocked<DeadLetterService>;
  let stellarService: jest.Mocked<StellarService>;
  let groupRepo: { findOne: jest.Mock; find: jest.Mock; save: jest.Mock };
  let groupSyncQueue: { addBulk: jest.Mock };

  beforeEach(async () => {
    groupRepo = { findOne: jest.fn(), find: jest.fn(), save: jest.fn() };
    groupSyncQueue = { addBulk: jest.fn().mockResolvedValue([]) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupSyncProcessor,
        { provide: DeadLetterService, useValue: { moveToDeadLetter: jest.fn().mockResolvedValue(undefined) } },
        { provide: StellarService, useValue: { getGroupState: jest.fn() } },
        { provide: getRepositoryToken(Group), useValue: groupRepo },
        { provide: getQueueToken(QUEUE_NAMES.GROUP_SYNC), useValue: groupSyncQueue },
      ],
    }).compile();

    processor = module.get(GroupSyncProcessor);
    deadLetterService = module.get(DeadLetterService);
    stellarService = module.get(StellarService);
  });

  afterEach(() => jest.clearAllMocks());

  // ── SYNC_GROUP_STATE ───────────────────────────────────────────────────────

  describe('SYNC_GROUP_STATE', () => {
    const jobData: import('./queue.interfaces').SyncGroupStateJobData = {
      groupId: GROUP_ID,
      contractAddress: CONTRACT,
      chainId: 8453,
    };

    it('updates currentRound when contract reports a new round', async () => {
      groupRepo.findOne.mockResolvedValue({ ...activeGroup });
      stellarService.getGroupState.mockResolvedValue({ current_round: 3, status: 'ACTIVE' });
      groupRepo.save.mockResolvedValue({});

      await processor.process(makeJob(JOB_NAMES.SYNC_GROUP_STATE, jobData));

      expect(stellarService.getGroupState).toHaveBeenCalledWith(CONTRACT);
      expect(groupRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ currentRound: 3, staleAt: null }),
      );
    });

    it('updates status when contract reports COMPLETED', async () => {
      groupRepo.findOne.mockResolvedValue({ ...activeGroup });
      stellarService.getGroupState.mockResolvedValue({ current_round: 1, status: 'COMPLETED' });
      groupRepo.save.mockResolvedValue({});

      await processor.process(makeJob(JOB_NAMES.SYNC_GROUP_STATE, jobData));

      expect(groupRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: GroupStatus.COMPLETED }),
      );
    });

    it('skips save when already in sync', async () => {
      groupRepo.findOne.mockResolvedValue({ ...activeGroup });
      stellarService.getGroupState.mockResolvedValue({ current_round: 1, status: 'ACTIVE' });

      await processor.process(makeJob(JOB_NAMES.SYNC_GROUP_STATE, jobData));

      expect(groupRepo.save).not.toHaveBeenCalled();
    });

    it('skips when group not found', async () => {
      groupRepo.findOne.mockResolvedValue(null);

      await processor.process(makeJob(JOB_NAMES.SYNC_GROUP_STATE, jobData));

      expect(stellarService.getGroupState).not.toHaveBeenCalled();
    });

    it('handles forceSync=true without error', async () => {
      groupRepo.findOne.mockResolvedValue({ ...activeGroup });
      stellarService.getGroupState.mockResolvedValue({ current_round: 1, status: 'ACTIVE' });

      await expect(
        processor.process(makeJob(JOB_NAMES.SYNC_GROUP_STATE, { ...jobData, forceSync: true })),
      ).resolves.not.toThrow();
    });
  });

  // ── SYNC_ALL_GROUPS ────────────────────────────────────────────────────────

  describe('SYNC_ALL_GROUPS', () => {
    it('dispatches SYNC_GROUP_STATE jobs for all ACTIVE groups', async () => {
      const groups = [
        { id: 'g1', contractAddress: '0xc1' },
        { id: 'g2', contractAddress: '0xc2' },
      ];
      groupRepo.find
        .mockResolvedValueOnce(groups)
        .mockResolvedValueOnce([]); // second page empty → stop

      await processor.process(makeJob(JOB_NAMES.SYNC_ALL_GROUPS, { chainId: 8453, batchSize: 50 }));

      expect(groupSyncQueue.addBulk).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ name: JOB_NAMES.SYNC_GROUP_STATE, data: expect.objectContaining({ groupId: 'g1' }) }),
          expect.objectContaining({ name: JOB_NAMES.SYNC_GROUP_STATE, data: expect.objectContaining({ groupId: 'g2' }) }),
        ]),
      );
    });

    it('skips groups without a contractAddress', async () => {
      groupRepo.find.mockResolvedValueOnce([{ id: 'g1', contractAddress: null }]).mockResolvedValueOnce([]);

      await processor.process(makeJob(JOB_NAMES.SYNC_ALL_GROUPS, { chainId: 1 }));

      expect(groupSyncQueue.addBulk).not.toHaveBeenCalled();
    });

    it('uses default batchSize of 50', async () => {
      groupRepo.find.mockResolvedValue([]);

      await processor.process(makeJob(JOB_NAMES.SYNC_ALL_GROUPS, { chainId: 1 }));

      expect(groupRepo.find).toHaveBeenCalledWith(
        expect.objectContaining({ take: 50 }),
      );
    });
  });

  // ── Unknown job ────────────────────────────────────────────────────────────

  it('throws for unknown job name', async () => {
    await expect(processor.process(makeJob('unknown-sync', {}))).rejects.toThrow(
      'Unknown group-sync job type: unknown-sync',
    );
  });

  // ── DLQ handling ───────────────────────────────────────────────────────────

  describe('onFailed()', () => {
    it('does NOT move to DLQ when retries remain', async () => {
      const job = makeJob(JOB_NAMES.SYNC_GROUP_STATE, {}, { attemptsMade: 1, opts: { attempts: 3 } } as any);
      await processor.onFailed(job, new Error('contract reverted'));
      expect(deadLetterService.moveToDeadLetter).not.toHaveBeenCalled();
    });

    it('moves to DLQ after max retries exhausted', async () => {
      const job = makeJob(JOB_NAMES.SYNC_GROUP_STATE, {}, { attemptsMade: 3, opts: { attempts: 3 } } as any);
      await processor.onFailed(job, new Error('permanent failure'));
      expect(deadLetterService.moveToDeadLetter).toHaveBeenCalledWith(job, expect.any(Error), QUEUE_NAMES.GROUP_SYNC);
    });
  });
});
