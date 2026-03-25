import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES, JOB_NAMES, BACKOFF_DELAYS } from '../queue.constants';
import {
  SyncGroupStateJobData,
  SyncAllGroupsJobData,
} from '../queue.interfaces';
import { DeadLetterService } from '../dead-letter.service';

@Processor(QUEUE_NAMES.GROUP_SYNC, {
  concurrency: 2,
})
export class GroupSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(GroupSyncProcessor.name);

  constructor(private readonly deadLetterService: DeadLetterService) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    this.logger.debug(`Processing group-sync job [${job.name}] id=${job.id}`);

    switch (job.name) {
      case JOB_NAMES.SYNC_GROUP_STATE:
        return this.handleSyncGroupState(job as Job<SyncGroupStateJobData>);
      case JOB_NAMES.SYNC_ALL_GROUPS:
        return this.handleSyncAllGroups(job as Job<SyncAllGroupsJobData>);
      default:
        throw new Error(`Unknown group-sync job type: ${job.name}`);
    }
  }

  private async handleSyncGroupState(
    job: Job<SyncGroupStateJobData>,
  ): Promise<void> {
    const { groupId, contractAddress, chainId, forceSync } = job.data;
    this.logger.log(
      `Syncing group state groupId=${groupId} contract=${contractAddress} chain=${chainId} force=${forceSync ?? false}`,
    );
    // TODO: await this.groupContractService.syncGroup(groupId, contractAddress, chainId);
    this.logger.log(`Group state synced groupId=${groupId}`);
  }

  private async handleSyncAllGroups(
    job: Job<SyncAllGroupsJobData>,
  ): Promise<void> {
    const { chainId, batchSize = 50 } = job.data;
    this.logger.log(
      `Syncing all groups chainId=${chainId} batchSize=${batchSize}`,
    );
    // TODO: paginate over groups and enqueue individual SyncGroupState jobs
    // const groups = await this.groupRepository.findAllActive({ chainId });
    // for (const group of groups) { await queue.add(JOB_NAMES.SYNC_GROUP_STATE, { groupId: group.id, ... }) }
    this.logger.log(`All groups sync dispatched chainId=${chainId}`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job): void {
    this.logger.log(`Group-sync job completed [${job.name}] id=${job.id}`);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, error: Error): Promise<void> {
    const maxAttempts = job.opts?.attempts ?? 3;
    this.logger.error(
      `Group-sync job failed [${job.name}] id=${job.id} attempt=${job.attemptsMade}/${maxAttempts}: ${error.message}`,
      error.stack,
    );

    if (job.attemptsMade >= maxAttempts) {
      this.logger.error(
        `Group-sync job [${job.name}] id=${job.id} exhausted all retries → moving to dead-letter queue`,
      );
      await this.deadLetterService.moveToDeadLetter(
        job,
        error,
        QUEUE_NAMES.GROUP_SYNC,
      );
    }
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string): void {
    this.logger.warn(`Group-sync job stalled id=${jobId}`);
  }
}

export function groupSyncBackoffStrategy(attemptsMade: number): number {
  return (
    BACKOFF_DELAYS[attemptsMade] ?? BACKOFF_DELAYS[BACKOFF_DELAYS.length - 1]
  );
}
