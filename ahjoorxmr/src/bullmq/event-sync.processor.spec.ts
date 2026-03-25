import { Test, TestingModule } from '@nestjs/testing';
import { Job } from 'bullmq';
import { EventSyncProcessor } from '../../queue/processors/event-sync.processor';
import { DeadLetterService } from '../../queue/dead-letter.service';
import { JOB_NAMES, QUEUE_NAMES } from '../../queue/queue.constants';

const makeJob = (
  name: string,
  data: unknown,
  overrides: Partial<Job> = {},
): Job =>
  ({
    id: 'evt-job-id',
    name,
    data,
    attemptsMade: 0,
    opts: { attempts: 3 },
    ...overrides,
  }) as unknown as Job;

const onChainEventData = {
  eventName: 'Transfer',
  transactionHash: '0xabc',
  blockNumber: 12345,
  contractAddress: '0xcontract',
  logIndex: 0,
  rawData: {},
  chainId: 1,
};

const transferData = {
  from: '0xsender',
  to: '0xrecipient',
  amount: '1000000000000000000',
  transactionHash: '0xdef',
  blockNumber: 12346,
  tokenAddress: '0xtoken',
  chainId: 1,
};

const approvalData = {
  owner: '0xowner',
  spender: '0xspender',
  amount: '500000000000000000',
  transactionHash: '0xghi',
  blockNumber: 12347,
  tokenAddress: '0xtoken',
  chainId: 1,
};

describe('EventSyncProcessor', () => {
  let processor: EventSyncProcessor;
  let deadLetterService: jest.Mocked<DeadLetterService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EventSyncProcessor,
        {
          provide: DeadLetterService,
          useValue: {
            moveToDeadLetter: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    processor = module.get(EventSyncProcessor);
    deadLetterService = module.get(DeadLetterService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('process()', () => {
    it('should process SYNC_ON_CHAIN_EVENT', async () => {
      const job = makeJob(JOB_NAMES.SYNC_ON_CHAIN_EVENT, onChainEventData);
      await expect(processor.process(job)).resolves.not.toThrow();
    });

    it('should process PROCESS_TRANSFER_EVENT', async () => {
      const job = makeJob(JOB_NAMES.PROCESS_TRANSFER_EVENT, transferData);
      await expect(processor.process(job)).resolves.not.toThrow();
    });

    it('should process PROCESS_APPROVAL_EVENT', async () => {
      const job = makeJob(JOB_NAMES.PROCESS_APPROVAL_EVENT, approvalData);
      await expect(processor.process(job)).resolves.not.toThrow();
    });

    it('should throw for unknown job name', async () => {
      const job = makeJob('mystery-event', {});
      await expect(processor.process(job)).rejects.toThrow(
        'Unknown event-sync job type: mystery-event',
      );
    });
  });

  describe('onFailed()', () => {
    it('should NOT move to dead-letter when retries remain', async () => {
      const job = makeJob(JOB_NAMES.SYNC_ON_CHAIN_EVENT, onChainEventData, {
        attemptsMade: 2,
        opts: { attempts: 3 },
      } as any);
      await processor.onFailed(job, new Error('RPC timeout'));
      expect(deadLetterService.moveToDeadLetter).not.toHaveBeenCalled();
    });

    it('should move to dead-letter when all retries exhausted', async () => {
      const job = makeJob(JOB_NAMES.SYNC_ON_CHAIN_EVENT, onChainEventData, {
        attemptsMade: 3,
        opts: { attempts: 3 },
      } as any);
      await processor.onFailed(job, new Error('permanent RPC failure'));
      expect(deadLetterService.moveToDeadLetter).toHaveBeenCalledWith(
        job,
        expect.any(Error),
        QUEUE_NAMES.EVENT_SYNC,
      );
    });
  });

  describe('event handlers', () => {
    it('onCompleted should not throw', () => {
      const job = makeJob(JOB_NAMES.SYNC_ON_CHAIN_EVENT, onChainEventData);
      expect(() => processor.onCompleted(job)).not.toThrow();
    });

    it('onStalled should not throw', () => {
      expect(() => processor.onStalled('evt-stalled-id')).not.toThrow();
    });
  });
});
