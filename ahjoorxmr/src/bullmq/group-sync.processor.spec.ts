import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { GroupSyncProcessor } from '../../queue/processors/group-sync.processor';
import { DeadLetterService } from '../../queue/dead-letter.service';
import { JOB_NAMES, QUEUE_NAMES } from '../../queue/queue.constants';

const makeJob = (
  name: string,
  data: unknown,
  overrides: Partial<Job> = {},
): Job =>
  ({
    id: 'grp-job-id',
    name,
    data,
    attemptsMade: 0,
    opts: { attempts: 3 },
    ...overrides,
  }) as unknown as Job;

describe('GroupSyncProcessor', () => {
  let processor: GroupSyncProcessor;
  let deadLetterService: jest.Mocked<DeadLetterService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupSyncProcessor,
        {
          provide: DeadLetterService,
          useValue: {
            moveToDeadLetter: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    processor = module.get(GroupSyncProcessor);
    deadLetterService = module.get(DeadLetterService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('process()', () => {
    it('should process SYNC_GROUP_STATE', async () => {
      const job = makeJob(JOB_NAMES.SYNC_GROUP_STATE, {
        groupId: 'g1',
        contractAddress: '0xcontract',
        chainId: 8453,
      });
      await expect(processor.process(job)).resolves.not.toThrow();
    });

    it('should process SYNC_GROUP_STATE with forceSync=true', async () => {
      const job = makeJob(JOB_NAMES.SYNC_GROUP_STATE, {
        groupId: 'g1',
        contractAddress: '0xcontract',
        chainId: 8453,
        forceSync: true,
      });
      await expect(processor.process(job)).resolves.not.toThrow();
    });

    it('should process SYNC_ALL_GROUPS', async () => {
      const job = makeJob(JOB_NAMES.SYNC_ALL_GROUPS, {
        chainId: 8453,
        batchSize: 25,
      });
      await expect(processor.process(job)).resolves.not.toThrow();
    });

    it('should process SYNC_ALL_GROUPS with default batchSize', async () => {
      const job = makeJob(JOB_NAMES.SYNC_ALL_GROUPS, { chainId: 1 });
      await expect(processor.process(job)).resolves.not.toThrow();
    });

    it('should throw for unknown job name', async () => {
      const job = makeJob('unknown-sync', {});
      await expect(processor.process(job)).rejects.toThrow(
        'Unknown group-sync job type: unknown-sync',
      );
    });
  });

  describe('onFailed()', () => {
    it('should NOT move to dead-letter when retries remain', async () => {
      const job = makeJob(
        JOB_NAMES.SYNC_GROUP_STATE,
        { groupId: 'g1', contractAddress: '0x', chainId: 1 },
        { attemptsMade: 1, opts: { attempts: 3 } } as any,
      );
      await processor.onFailed(job, new Error('contract call reverted'));
      expect(deadLetterService.moveToDeadLetter).not.toHaveBeenCalled();
    });

    it('should move to dead-letter after max retries', async () => {
      const job = makeJob(
        JOB_NAMES.SYNC_GROUP_STATE,
        { groupId: 'g1', contractAddress: '0x', chainId: 1 },
        { attemptsMade: 3, opts: { attempts: 3 } } as any,
      );
      await processor.onFailed(
        job,
        new Error('contract call permanently failed'),
      );
      expect(deadLetterService.moveToDeadLetter).toHaveBeenCalledWith(
        job,
        expect.any(Error),
        QUEUE_NAMES.GROUP_SYNC,
      );
    });
  });

  describe('event handlers', () => {
    it('onCompleted should not throw', () => {
      expect(() =>
        processor.onCompleted(makeJob(JOB_NAMES.SYNC_GROUP_STATE, {})),
      ).not.toThrow();
    });

    it('onStalled should not throw', () => {
      expect(() => processor.onStalled('stalled-id')).not.toThrow();
    });
  });
});
