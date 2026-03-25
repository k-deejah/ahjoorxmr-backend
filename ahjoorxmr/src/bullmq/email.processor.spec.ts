import { Test, TestingModule } from '@nestjs/testing';
import { EmailProcessor } from './email.processor';
import { DeadLetterService } from './dead-letter.service';
import { MailService } from '../mail/mail.service';
import { Job } from 'bullmq';
import { QUEUE_NAMES, JOB_NAMES } from './queue.constants';

describe('EmailProcessor', () => {
  let processor: EmailProcessor;
  let mailService: MailService;
  let deadLetterService: DeadLetterService;

  const mockMailService = {
    sendMail: jest.fn().mockResolvedValue(undefined),
    sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
    sendNotificationEmail: jest.fn().mockResolvedValue(undefined),
  };

  const mockDeadLetterService = {
    moveToDeadLetter: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailProcessor,
        {
          provide: MailService,
          useValue: mockMailService,
        },
        {
          provide: DeadLetterService,
          useValue: mockDeadLetterService,
        },
      ],
    }).compile();

    processor = module.get<EmailProcessor>(EmailProcessor);
    mailService = module.get<MailService>(MailService);
    deadLetterService = module.get<DeadLetterService>(DeadLetterService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(processor).toBeDefined();
  });

  describe('process', () => {
    it('should handle SEND_EMAIL job', async () => {
      const job = {
        id: '1',
        name: JOB_NAMES.SEND_EMAIL,
        data: {
          to: 'test@example.com',
          subject: 'Test',
          html: '<p>Test</p>',
        },
      } as Job;

      await processor.process(job);

      expect(mailService.sendMail).toHaveBeenCalledWith({
        to: 'test@example.com',
        subject: 'Test',
        html: '<p>Test</p>',
        text: undefined,
        template: undefined,
        context: undefined,
      });
    });

    it('should handle SEND_WELCOME_EMAIL job', async () => {
      const job = {
        id: '2',
        name: JOB_NAMES.SEND_WELCOME_EMAIL,
        data: {
          userId: 'user-123',
          email: 'test@example.com',
          username: 'John Doe',
        },
      } as Job;

      await processor.process(job);

      expect(mailService.sendWelcomeEmail).toHaveBeenCalledWith(
        'test@example.com',
        'John Doe',
      );
    });

    it('should handle SEND_NOTIFICATION_EMAIL job', async () => {
      const job = {
        id: '3',
        name: JOB_NAMES.SEND_NOTIFICATION_EMAIL,
        data: {
          userId: 'user-123',
          notificationType: 'info',
          to: 'test@example.com',
          subject: 'Notification',
          body: 'Test notification',
          actionLink: 'http://example.com',
        },
      } as Job;

      await processor.process(job);

      expect(mailService.sendNotificationEmail).toHaveBeenCalledWith(
        'test@example.com',
        'user-123',
        'Notification',
        'Test notification',
        'http://example.com',
      );
    });

    it('should throw error for unknown job type', async () => {
      const job = {
        id: '4',
        name: 'UNKNOWN_JOB',
        data: {},
      } as Job;

      await expect(processor.process(job)).rejects.toThrow(
        'Unknown email job type: UNKNOWN_JOB',
      );
    });
  });

  describe('onFailed', () => {
    it('should move job to dead letter queue after max retries', async () => {
      const job = {
        id: '1',
        name: JOB_NAMES.SEND_EMAIL,
        data: {},
        attemptsMade: 3,
        opts: { attempts: 3 },
      } as Job;

      const error = new Error('Send failed');

      await processor.onFailed(job, error);

      expect(deadLetterService.moveToDeadLetter).toHaveBeenCalledWith(
        job,
        error,
        QUEUE_NAMES.EMAIL,
      );
    });

    it('should not move job to dead letter queue if retries remain', async () => {
      const job = {
        id: '1',
        name: JOB_NAMES.SEND_EMAIL,
        data: {},
        attemptsMade: 1,
        opts: { attempts: 3 },
      } as Job;

      const error = new Error('Send failed');

      await processor.onFailed(job, error);

      expect(deadLetterService.moveToDeadLetter).not.toHaveBeenCalled();
    });
  });
});
