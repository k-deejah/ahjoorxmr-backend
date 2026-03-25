import { Test, TestingModule } from '@nestjs/testing';
import { getQueueToken } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import { DeadLetterService } from '../../queue/dead-letter.service';
import { QUEUE_NAMES, JOB_NAMES } from '../../queue/queue.constants';

const makeJob = (overrides: Partial<Job> = {}): Job =>
  ({
    id: 'original-job-id',
    name: JOB_NAMES.SEND_EMAIL,
    data: { to: 'test@example.com', subject: 'Test' },
    attemptsMade: 3,
    ...overrides,
  }) as unknown as Job;

describe('DeadLetterService', () => {
  let service: DeadLetterService;
  let deadLetterQueue: jest.Mocked<Queue>;

  beforeEach(async () => {
    deadLetterQueue = {
      add: jest.fn().mockResolvedValue({ id: 'dl-job-id' }),
      name: QUEUE_NAMES.DEAD_LETTER,
    } as unknown as jest.Mocked<Queue>;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        DeadLetterService,
        {
          provide: getQueueToken(QUEUE_NAMES.DEAD_LETTER),
          useValue: deadLetterQueue,
        },
      ],
    }).compile();

    service = module.get(DeadLetterService);
  });

  afterEach(() => jest.clearAllMocks());

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('moveToDeadLetter()', () => {
    it('should add a dead-letter job with correct shape', async () => {
      const job = makeJob();
      const error = new Error('SMTP connection refused');
      error.stack =
        'Error: SMTP connection refused\n  at sendEmail (mail.ts:42)';

      await service.moveToDeadLetter(job, error, QUEUE_NAMES.EMAIL);

      expect(deadLetterQueue.add).toHaveBeenCalledTimes(1);
      const [jobName, payload, opts] = deadLetterQueue.add.mock.calls[0];

      expect(jobName).toBe(JOB_NAMES.DEAD_LETTER);
      expect(payload).toMatchObject({
        originalQueue: QUEUE_NAMES.EMAIL,
        originalJobId: 'original-job-id',
        originalJobName: JOB_NAMES.SEND_EMAIL,
        originalJobData: { to: 'test@example.com', subject: 'Test' },
        failedReason: 'SMTP connection refused',
        attemptsMade: 3,
        stackTrace: error.stack,
      });
      expect(payload.failedAt).toBeDefined();
      expect(opts).toEqual({ removeOnComplete: false, removeOnFail: false });
    });

    it('should handle jobs with undefined id', async () => {
      const job = makeJob({ id: undefined });
      const error = new Error('some error');

      await service.moveToDeadLetter(job, error, QUEUE_NAMES.EVENT_SYNC);

      const [, payload] = deadLetterQueue.add.mock.calls[0];
      expect(payload.originalJobId).toBeUndefined();
    });

    it('should handle errors without stack trace', async () => {
      const job = makeJob();
      const error = new Error('no stack');
      delete error.stack;

      await service.moveToDeadLetter(job, error, QUEUE_NAMES.GROUP_SYNC);

      const [, payload] = deadLetterQueue.add.mock.calls[0];
      expect(payload.stackTrace).toBeUndefined();
    });

    it('should propagate queue.add rejection', async () => {
      deadLetterQueue.add.mockRejectedValueOnce(
        new Error('Redis connection lost'),
      );

      const job = makeJob();
      await expect(
        service.moveToDeadLetter(job, new Error('test'), QUEUE_NAMES.EMAIL),
      ).rejects.toThrow('Redis connection lost');
    });
  });
});
