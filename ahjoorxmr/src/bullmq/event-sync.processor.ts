import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES, JOB_NAMES, BACKOFF_DELAYS } from '../queue.constants';
import {
  SyncOnChainEventJobData,
  ProcessTransferEventJobData,
  ProcessApprovalEventJobData,
} from '../queue.interfaces';
import { DeadLetterService } from '../dead-letter.service';

@Processor(QUEUE_NAMES.EVENT_SYNC, {
  concurrency: 3,
})
export class EventSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(EventSyncProcessor.name);

  constructor(private readonly deadLetterService: DeadLetterService) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    this.logger.debug(`Processing event-sync job [${job.name}] id=${job.id}`);

    switch (job.name) {
      case JOB_NAMES.SYNC_ON_CHAIN_EVENT:
        return this.handleSyncOnChainEvent(job as Job<SyncOnChainEventJobData>);
      case JOB_NAMES.PROCESS_TRANSFER_EVENT:
        return this.handleTransferEvent(
          job as Job<ProcessTransferEventJobData>,
        );
      case JOB_NAMES.PROCESS_APPROVAL_EVENT:
        return this.handleApprovalEvent(
          job as Job<ProcessApprovalEventJobData>,
        );
      default:
        throw new Error(`Unknown event-sync job type: ${job.name}`);
    }
  }

  private async handleSyncOnChainEvent(
    job: Job<SyncOnChainEventJobData>,
  ): Promise<void> {
    const {
      eventName,
      transactionHash,
      blockNumber,
      contractAddress,
      chainId,
    } = job.data;
    this.logger.log(
      `Syncing on-chain event eventName=${eventName} tx=${transactionHash} block=${blockNumber} chain=${chainId}`,
    );
    // TODO: await this.eventService.persistEvent(job.data);
    this.logger.log(`On-chain event synced tx=${transactionHash}`);
  }

  private async handleTransferEvent(
    job: Job<ProcessTransferEventJobData>,
  ): Promise<void> {
    const { from, to, amount, transactionHash, chainId } = job.data;
    this.logger.log(
      `Processing Transfer event from=${from} to=${to} amount=${amount} tx=${transactionHash} chain=${chainId}`,
    );
    // TODO: await this.transferService.processTransfer(job.data);
    this.logger.log(`Transfer event processed tx=${transactionHash}`);
  }

  private async handleApprovalEvent(
    job: Job<ProcessApprovalEventJobData>,
  ): Promise<void> {
    const { owner, spender, amount, transactionHash, chainId } = job.data;
    this.logger.log(
      `Processing Approval event owner=${owner} spender=${spender} amount=${amount} tx=${transactionHash} chain=${chainId}`,
    );
    // TODO: await this.approvalService.processApproval(job.data);
    this.logger.log(`Approval event processed tx=${transactionHash}`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job): void {
    this.logger.log(`Event-sync job completed [${job.name}] id=${job.id}`);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, error: Error): Promise<void> {
    const maxAttempts = job.opts?.attempts ?? 3;
    this.logger.error(
      `Event-sync job failed [${job.name}] id=${job.id} attempt=${job.attemptsMade}/${maxAttempts}: ${error.message}`,
      error.stack,
    );

    if (job.attemptsMade >= maxAttempts) {
      this.logger.error(
        `Event-sync job [${job.name}] id=${job.id} exhausted all retries → moving to dead-letter queue`,
      );
      await this.deadLetterService.moveToDeadLetter(
        job,
        error,
        QUEUE_NAMES.EVENT_SYNC,
      );
    }
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string): void {
    this.logger.warn(`Event-sync job stalled id=${jobId}`);
  }
}

export function eventSyncBackoffStrategy(attemptsMade: number): number {
  return (
    BACKOFF_DELAYS[attemptsMade] ?? BACKOFF_DELAYS[BACKOFF_DELAYS.length - 1]
  );
}
