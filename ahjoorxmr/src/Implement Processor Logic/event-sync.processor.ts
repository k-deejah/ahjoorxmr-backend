import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { OnChainEvent } from '../entities/on-chain-event.entity';
import { ApprovalEvent } from '../entities/approval-event.entity';
import { ContributionsService } from '../contributions/contributions.service';

export const QUEUES = {
  EVENT_SYNC: 'event-sync',
} as const;

export const JOBS = {
  SYNC_ON_CHAIN_EVENT: 'SYNC_ON_CHAIN_EVENT',
  PROCESS_TRANSFER_EVENT: 'PROCESS_TRANSFER_EVENT',
  PROCESS_APPROVAL_EVENT: 'PROCESS_APPROVAL_EVENT',
} as const;

export interface SyncOnChainEventPayload {
  eventName: string;
  transactionHash: string;
  blockNumber: number;
  contractAddress: string;
  chainId: number;
}

export interface TransferEventPayload {
  from: string;
  to: string;
  amount: string;
  transactionHash: string;
  blockNumber: number;
  contractAddress: string;
  chainId: number;
  contributionId?: string;
}

export interface ApprovalEventPayload {
  ownerAddress: string;
  spenderAddress: string;
  amount: string;
  transactionHash: string;
  blockNumber: number;
  contractAddress: string;
  chainId: number;
}

@Processor(QUEUES.EVENT_SYNC, {
  concurrency: 5,
  limiter: { max: 100, duration: 1000 },
})
export class EventSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(EventSyncProcessor.name);

  constructor(
    @InjectRepository(OnChainEvent)
    private readonly onChainEventRepo: Repository<OnChainEvent>,

    @InjectRepository(ApprovalEvent)
    private readonly approvalEventRepo: Repository<ApprovalEvent>,

    private readonly contributionsService: ContributionsService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    this.logger.log(`Processing job ${job.name} [id=${job.id}]`);

    switch (job.name) {
      case JOBS.SYNC_ON_CHAIN_EVENT:
        return this.handleSyncOnChainEvent(job as Job<SyncOnChainEventPayload>);

      case JOBS.PROCESS_TRANSFER_EVENT:
        return this.handleTransferEvent(job as Job<TransferEventPayload>);

      case JOBS.PROCESS_APPROVAL_EVENT:
        return this.handleApprovalEvent(job as Job<ApprovalEventPayload>);

      default:
        this.logger.warn(`Unknown job name: ${job.name}`);
        throw new Error(`Unknown job name: ${job.name}`);
    }
  }

  // ---------------------------------------------------------------------------
  // SYNC_ON_CHAIN_EVENT
  // ---------------------------------------------------------------------------
  async handleSyncOnChainEvent(
    job: Job<SyncOnChainEventPayload>,
  ): Promise<OnChainEvent> {
    const {
      eventName,
      transactionHash,
      blockNumber,
      contractAddress,
      chainId,
    } = job.data;

    this.logger.log(
      `Syncing on-chain event: ${eventName} tx=${transactionHash} block=${blockNumber}`,
    );

    // Upsert – idempotent in case the job is retried
    const existing = await this.onChainEventRepo.findOne({
      where: { transactionHash, chainId },
    });

    if (existing) {
      this.logger.log(
        `On-chain event already persisted (id=${existing.id}), skipping.`,
      );
      return existing;
    }

    const entity = this.onChainEventRepo.create({
      eventName,
      transactionHash,
      blockNumber,
      contractAddress,
      chainId,
      processedAt: new Date(),
    });

    const saved = await this.onChainEventRepo.save(entity);
    this.logger.log(`Persisted on-chain event id=${saved.id}`);
    return saved;
  }

  // ---------------------------------------------------------------------------
  // PROCESS_TRANSFER_EVENT
  // ---------------------------------------------------------------------------
  async handleTransferEvent(job: Job<TransferEventPayload>): Promise<void> {
    const {
      from,
      to,
      amount,
      transactionHash,
      blockNumber,
      contractAddress,
      chainId,
      contributionId,
    } = job.data;

    this.logger.log(
      `Processing Transfer event: from=${from} to=${to} amount=${amount} tx=${transactionHash}`,
    );

    await this.contributionsService.recordContributionFromTransfer({
      from,
      to,
      amount,
      transactionHash,
      blockNumber,
      contractAddress,
      chainId,
      contributionId,
    });

    this.logger.log(`Contribution recorded for tx=${transactionHash}`);
  }

  // ---------------------------------------------------------------------------
  // PROCESS_APPROVAL_EVENT
  // ---------------------------------------------------------------------------
  async handleApprovalEvent(
    job: Job<ApprovalEventPayload>,
  ): Promise<ApprovalEvent> {
    const {
      ownerAddress,
      spenderAddress,
      amount,
      transactionHash,
      blockNumber,
      contractAddress,
      chainId,
    } = job.data;

    this.logger.log(
      `Processing Approval event: owner=${ownerAddress} spender=${spenderAddress} amount=${amount} tx=${transactionHash}`,
    );

    // Idempotency check
    const existing = await this.approvalEventRepo.findOne({
      where: { transactionHash },
    });
    if (existing) {
      this.logger.log(`Approval event already persisted (id=${existing.id})`);
      return existing;
    }

    const entity = this.approvalEventRepo.create({
      ownerAddress,
      spenderAddress,
      amount,
      transactionHash,
      blockNumber,
      contractAddress,
      chainId,
    });

    const saved = await this.approvalEventRepo.save(entity);
    this.logger.log(`Persisted approval event id=${saved.id}`);
    return saved;
  }
}
