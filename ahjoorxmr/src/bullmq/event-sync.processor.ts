import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { QUEUE_NAMES, JOB_NAMES, BACKOFF_DELAYS } from './queue.constants';
import {
  SyncOnChainEventJobData,
  ProcessTransferEventJobData,
  ProcessApprovalEventJobData,
} from './queue.interfaces';
import { DeadLetterService } from './dead-letter.service';
import { StellarService } from '../stellar/stellar.service';
import { Group } from '../groups/entities/group.entity';
import { GroupStatus } from '../groups/entities/group-status.enum';
import { Contribution } from '../contributions/entities/contribution.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { NotificationsService } from '../notification/notifications.service';
import { NotificationType } from '../notification/notification-type.enum';

@Processor(QUEUE_NAMES.EVENT_SYNC, { concurrency: 3 })
export class EventSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(EventSyncProcessor.name);

  constructor(
    private readonly deadLetterService: DeadLetterService,
    private readonly stellarService: StellarService,
    private readonly notificationsService: NotificationsService,
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    @InjectRepository(Contribution)
    private readonly contributionRepository: Repository<Contribution>,
    @InjectRepository(Membership)
    private readonly membershipRepository: Repository<Membership>,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    this.logger.debug(`Processing event-sync job [${job.name}] id=${job.id}`);

    switch (job.name) {
      case JOB_NAMES.SYNC_ON_CHAIN_EVENT:
        return this.handleSyncOnChainEvent(job as Job<SyncOnChainEventJobData>);
      case JOB_NAMES.PROCESS_TRANSFER_EVENT:
        return this.handleTransferEvent(job as Job<ProcessTransferEventJobData>);
      case JOB_NAMES.PROCESS_APPROVAL_EVENT:
        return this.handleApprovalEvent(job as Job<ProcessApprovalEventJobData>);
      default:
        throw new Error(`Unknown event-sync job type: ${job.name}`);
    }
  }

  private async handleSyncOnChainEvent(
    job: Job<SyncOnChainEventJobData>,
  ): Promise<void> {
    const { contractAddress, chainId } = job.data;
    this.logger.log(`Syncing on-chain event contract=${contractAddress} chain=${chainId}`);

    const group = await this.groupRepository.findOne({ where: { contractAddress } });
    if (!group) {
      this.logger.warn(`No group found for contractAddress=${contractAddress}`);
      return;
    }

    const state = (await this.stellarService.getGroupState(contractAddress)) as Record<string, unknown> | null;
    if (!state) return;

    let changed = false;

    const onChainRound = typeof state['current_round'] === 'number' ? state['current_round'] : null;
    if (onChainRound !== null && onChainRound !== group.currentRound) {
      group.currentRound = onChainRound;
      changed = true;
    }

    const onChainStatus = typeof state['status'] === 'string' ? (state['status'] as string).toUpperCase() : null;
    if (onChainStatus && onChainStatus !== group.status && Object.values(GroupStatus).includes(onChainStatus as GroupStatus)) {
      group.status = onChainStatus as GroupStatus;
      changed = true;
    }

    if (changed) {
      await this.groupRepository.save(group);
      this.logger.log(`Group ${group.id} reconciled with on-chain state`);
    }
  }

  private async handleTransferEvent(
    job: Job<ProcessTransferEventJobData>,
  ): Promise<void> {
    const { from, to, amount, transactionHash, blockNumber, chainId } = job.data;
    this.logger.log(`Processing Transfer from=${from} to=${to} tx=${transactionHash}`);

    // Idempotency: skip if already recorded
    const existing = await this.contributionRepository.findOne({ where: { transactionHash } });
    if (existing) {
      this.logger.log(`Transfer tx=${transactionHash} already recorded, skipping`);
      return;
    }

    // Resolve membership by wallet address (to = recipient / contributor wallet)
    const membership = await this.membershipRepository.findOne({ where: { walletAddress: to } });
    if (!membership) {
      this.logger.warn(`No membership found for wallet=${to}, tx=${transactionHash}`);
      return;
    }

    const group = await this.groupRepository.findOne({ where: { id: membership.groupId } });
    if (!group || group.status !== GroupStatus.ACTIVE) {
      this.logger.warn(`Group ${membership.groupId} not active, skipping transfer tx=${transactionHash}`);
      return;
    }

    // Record contribution
    const contribution = this.contributionRepository.create({
      groupId: group.id,
      userId: membership.userId,
      walletAddress: to,
      roundNumber: group.currentRound,
      amount,
      transactionHash,
      timestamp: new Date(),
    });
    await this.contributionRepository.save(contribution);

    // Mark membership as paid for current round
    membership.hasPaidCurrentRound = true;
    membership.contributionsMade += 1;
    await this.membershipRepository.save(membership);

    this.logger.log(`Contribution recorded id=${contribution.id} for user=${membership.userId}`);
  }

  private async handleApprovalEvent(
    job: Job<ProcessApprovalEventJobData>,
  ): Promise<void> {
    const { owner, spender, amount, transactionHash, chainId } = job.data;
    this.logger.log(`Processing Approval owner=${owner} spender=${spender} tx=${transactionHash}`);

    // Resolve membership by owner wallet
    const membership = await this.membershipRepository.findOne({ where: { walletAddress: owner } });
    if (!membership) {
      this.logger.warn(`No membership found for wallet=${owner}, tx=${transactionHash}`);
      return;
    }

    const group = await this.groupRepository.findOne({ where: { id: membership.groupId } });
    if (!group || group.status !== GroupStatus.ACTIVE) {
      this.logger.warn(`Group ${membership.groupId} not active, skipping approval tx=${transactionHash}`);
      return;
    }

    // An approval event signals the spender (contract) is authorised to pay out — record payout
    if (!membership.hasReceivedPayout) {
      membership.hasReceivedPayout = true;
      membership.transactionHash = transactionHash;
      await this.membershipRepository.save(membership);

      await this.notificationsService.notify({
        userId: membership.userId,
        type: NotificationType.PAYOUT_RECEIVED,
        title: 'Payout Received',
        body: `Your payout of ${amount} has been approved for group "${group.name}"`,
        metadata: { groupId: group.id, transactionHash, amount },
        idempotencyKey: `payout-approval-${transactionHash}`,
      });

      this.logger.log(`Payout recorded for user=${membership.userId} tx=${transactionHash}`);
    }
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
      await this.deadLetterService.moveToDeadLetter(job, error, QUEUE_NAMES.EVENT_SYNC);
    }
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string): void {
    this.logger.warn(`Event-sync job stalled id=${jobId}`);
  }
}

export function eventSyncBackoffStrategy(attemptsMade: number): number {
  return BACKOFF_DELAYS[attemptsMade] ?? BACKOFF_DELAYS[BACKOFF_DELAYS.length - 1];
}
