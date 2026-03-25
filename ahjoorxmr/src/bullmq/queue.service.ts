import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue, JobsOptions } from 'bullmq';
import {
  QUEUE_NAMES,
  JOB_NAMES,
  RETRY_CONFIG,
  BACKOFF_DELAYS,
} from './queue.constants';
import {
  SendEmailJobData,
  SendNotificationEmailJobData,
  SendWelcomeEmailJobData,
  SyncOnChainEventJobData,
  ProcessTransferEventJobData,
  ProcessApprovalEventJobData,
  SyncGroupStateJobData,
  SyncAllGroupsJobData,
} from './queue.interfaces';

export interface QueueStats {
  name: string;
  waiting: number;
  active: number;
  completed: number;
  failed: number;
  delayed: number;
  paused: number;
}

export interface AllQueueStats {
  queues: QueueStats[];
  deadLetter: QueueStats;
  retrievedAt: string;
}

// Shared job options with retry + custom backoff
function defaultJobOptions(overrides: Partial<JobsOptions> = {}): JobsOptions {
  return {
    attempts: RETRY_CONFIG.attempts,
    backoff: {
      type: 'custom',
      // The custom strategy is registered globally via createBullBoard / BullMQ worker options
    },
    removeOnComplete: { count: 1000, age: 24 * 60 * 60 },
    removeOnFail: false, // keep failed jobs for inspection
    ...overrides,
  };
}

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(
    @InjectQueue(QUEUE_NAMES.EMAIL) private readonly emailQueue: Queue,
    @InjectQueue(QUEUE_NAMES.EVENT_SYNC) private readonly eventSyncQueue: Queue,
    @InjectQueue(QUEUE_NAMES.GROUP_SYNC) private readonly groupSyncQueue: Queue,
    @InjectQueue(QUEUE_NAMES.DEAD_LETTER)
    private readonly deadLetterQueue: Queue,
  ) {}

  // ---------------------------------------------------------------------------
  // Email queue helpers
  // ---------------------------------------------------------------------------
  async addSendEmail(data: SendEmailJobData, opts?: Partial<JobsOptions>) {
    return this.emailQueue.add(
      JOB_NAMES.SEND_EMAIL,
      data,
      defaultJobOptions(opts),
    );
  }

  async addSendNotificationEmail(
    data: SendNotificationEmailJobData,
    opts?: Partial<JobsOptions>,
  ) {
    return this.emailQueue.add(
      JOB_NAMES.SEND_NOTIFICATION_EMAIL,
      data,
      defaultJobOptions(opts),
    );
  }

  async addSendWelcomeEmail(
    data: SendWelcomeEmailJobData,
    opts?: Partial<JobsOptions>,
  ) {
    return this.emailQueue.add(
      JOB_NAMES.SEND_WELCOME_EMAIL,
      data,
      defaultJobOptions(opts),
    );
  }

  // ---------------------------------------------------------------------------
  // Event sync queue helpers
  // ---------------------------------------------------------------------------
  async addSyncOnChainEvent(
    data: SyncOnChainEventJobData,
    opts?: Partial<JobsOptions>,
  ) {
    return this.eventSyncQueue.add(
      JOB_NAMES.SYNC_ON_CHAIN_EVENT,
      data,
      defaultJobOptions(opts),
    );
  }

  async addProcessTransferEvent(
    data: ProcessTransferEventJobData,
    opts?: Partial<JobsOptions>,
  ) {
    return this.eventSyncQueue.add(
      JOB_NAMES.PROCESS_TRANSFER_EVENT,
      data,
      defaultJobOptions(opts),
    );
  }

  async addProcessApprovalEvent(
    data: ProcessApprovalEventJobData,
    opts?: Partial<JobsOptions>,
  ) {
    return this.eventSyncQueue.add(
      JOB_NAMES.PROCESS_APPROVAL_EVENT,
      data,
      defaultJobOptions(opts),
    );
  }

  // ---------------------------------------------------------------------------
  // Group sync queue helpers
  // ---------------------------------------------------------------------------
  async addSyncGroupState(
    data: SyncGroupStateJobData,
    opts?: Partial<JobsOptions>,
  ) {
    return this.groupSyncQueue.add(
      JOB_NAMES.SYNC_GROUP_STATE,
      data,
      defaultJobOptions(opts),
    );
  }

  async addSyncAllGroups(
    data: SyncAllGroupsJobData,
    opts?: Partial<JobsOptions>,
  ) {
    return this.groupSyncQueue.add(
      JOB_NAMES.SYNC_ALL_GROUPS,
      data,
      defaultJobOptions(opts),
    );
  }

  // ---------------------------------------------------------------------------
  // Stats
  // ---------------------------------------------------------------------------
  async getStats(): Promise<AllQueueStats> {
    const [emailStats, eventStats, groupStats, dlStats] = await Promise.all([
      this.getQueueStats(this.emailQueue),
      this.getQueueStats(this.eventSyncQueue),
      this.getQueueStats(this.groupSyncQueue),
      this.getQueueStats(this.deadLetterQueue),
    ]);

    return {
      queues: [emailStats, eventStats, groupStats],
      deadLetter: dlStats,
      retrievedAt: new Date().toISOString(),
    };
  }

  private async getQueueStats(queue: Queue): Promise<QueueStats> {
    const [waiting, active, completed, failed, delayed, paused] =
      await Promise.all([
        queue.getWaitingCount(),
        queue.getActiveCount(),
        queue.getCompletedCount(),
        queue.getFailedCount(),
        queue.getDelayedCount(),
        queue.getPausedCount(),
      ]);

    return {
      name: queue.name,
      waiting,
      active,
      completed,
      failed,
      delayed,
      paused,
    };
  }

  // Expose queues for bull-board adapter
  getQueues(): Queue[] {
    return [
      this.emailQueue,
      this.eventSyncQueue,
      this.groupSyncQueue,
      this.deadLetterQueue,
    ];
  }
}

  // ---------------------------------------------------------------------------
  // Dead Letter Queue Management
  // ---------------------------------------------------------------------------
  async getDeadLetterJobs() {
    const jobs = await this.deadLetterQueue.getJobs(['completed', 'failed', 'waiting']);
    
    return jobs.map(job => ({
      id: job.id,
      name: job.name,
      data: job.data,
      failedReason: job.failedReason,
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
    }));
  }

  async retryDeadLetterJob(jobId: string) {
    const job = await this.deadLetterQueue.getJob(jobId);
    
    if (!job) {
      throw new Error(`Job ${jobId} not found in dead letter queue`);
    }

    const { originalQueue, originalJobName, originalJobData } = job.data;
    
    // Get the original queue
    let targetQueue: Queue;
    switch (originalQueue) {
      case QUEUE_NAMES.EMAIL:
        targetQueue = this.emailQueue;
        break;
      case QUEUE_NAMES.EVENT_SYNC:
        targetQueue = this.eventSyncQueue;
        break;
      case QUEUE_NAMES.GROUP_SYNC:
        targetQueue = this.groupSyncQueue;
        break;
      default:
        throw new Error(`Unknown queue: ${originalQueue}`);
    }

    // Re-add the job to the original queue
    await targetQueue.add(originalJobName, originalJobData, defaultJobOptions());
    
    // Remove from dead letter queue
    await job.remove();

    this.logger.log(`Retried job ${jobId} from dead letter queue to ${originalQueue}`);
    
    return { success: true, message: `Job ${jobId} retried successfully` };
  }
