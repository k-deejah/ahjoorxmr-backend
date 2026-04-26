import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job } from 'bullmq';
import { ConfigService } from '@nestjs/config';
import { QUEUE_NAMES, JOB_NAMES } from './queue.constants';
import { Contribution, ContributionStatus } from '../contributions/entities/contribution.entity';
import { StellarService } from '../stellar/stellar.service';
import { NotificationsService } from '../notification/notifications.service';
import { NotificationType } from '../notification/notification-type.enum';
import { RedisService } from '../common/redis/redis.service';

export interface TxConfirmationJobData {
  contributionId: string;
  transactionHash: string;
  userId: string;
  deadline: number;
}

const POLL_INTERVAL_MS = 5_000;
const LOCK_TTL_S = 300; // 5 min lock TTL

@Injectable()
@Processor(QUEUE_NAMES.TX_CONFIRMATION)
export class TxConfirmationProcessor extends WorkerHost {
  private readonly logger = new Logger(TxConfirmationProcessor.name);

  constructor(
    @InjectRepository(Contribution)
    private readonly contributionRepo: Repository<Contribution>,
    private readonly stellarService: StellarService,
    private readonly notificationsService: NotificationsService,
    private readonly redisService: RedisService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  async process(job: Job<TxConfirmationJobData>): Promise<void> {
    const { contributionId, transactionHash, userId, deadline } = job.data;
    const lockKey = `tx_confirm:${transactionHash}`;

    // Acquire Redis lock to prevent duplicate confirmation jobs
    const acquired = await this.redisService.setIfNotExistsWithExpiry(
      lockKey,
      job.id ?? contributionId,
      LOCK_TTL_S,
    );

    if (!acquired) {
      this.logger.warn(`Duplicate confirmation job skipped for tx ${transactionHash}`);
      return;
    }

    const timeoutMs = this.configService.get<number>('TX_CONFIRMATION_TIMEOUT_MS', 120_000);
    const effectiveDeadline = deadline ?? Date.now() + timeoutMs;

    try {
      await this.pollUntilTerminal(contributionId, transactionHash, userId, effectiveDeadline);
    } finally {
      await this.redisService.del(lockKey);
    }
  }

  private async pollUntilTerminal(
    contributionId: string,
    transactionHash: string,
    userId: string,
    deadline: number,
  ): Promise<void> {
    while (Date.now() < deadline) {
      let txStatus: 'PENDING' | 'CONFIRMED' | 'FAILED';

      try {
        txStatus = await this.stellarService.getTransactionStatus(transactionHash);
      } catch (err) {
        this.logger.error(
          `Error polling tx ${transactionHash}: ${(err as Error).message}`,
        );
        txStatus = 'PENDING';
      }

      if (txStatus === 'CONFIRMED') {
        await this.settle(contributionId, userId, ContributionStatus.CONFIRMED, transactionHash);
        return;
      }

      if (txStatus === 'FAILED') {
        await this.settle(contributionId, userId, ContributionStatus.FAILED, transactionHash);
        return;
      }

      await this.sleep(POLL_INTERVAL_MS);
    }

    // Deadline expired
    this.logger.warn(`TX confirmation timeout for hash ${transactionHash}`);
    await this.settle(contributionId, userId, ContributionStatus.FAILED, transactionHash, true);
  }

  private async settle(
    contributionId: string,
    userId: string,
    status: ContributionStatus.CONFIRMED | ContributionStatus.FAILED,
    transactionHash: string,
    timedOut = false,
  ): Promise<void> {
    await this.contributionRepo.update(contributionId, { status });

    const isConfirmed = status === ContributionStatus.CONFIRMED;
    const title = isConfirmed ? 'Contribution Confirmed' : 'Contribution Failed';
    const body = isConfirmed
      ? `Your contribution (tx: ${transactionHash}) has been confirmed on-chain.`
      : timedOut
        ? `Your contribution (tx: ${transactionHash}) timed out waiting for confirmation.`
        : `Your contribution (tx: ${transactionHash}) failed on-chain.`;

    await this.notificationsService.notify({
      userId,
      type: isConfirmed ? NotificationType.PAYOUT_RECEIVED : NotificationType.SYSTEM_ALERT,
      title,
      body,
      metadata: { contributionId, transactionHash, timedOut },
      idempotencyKey: `tx_confirm:${transactionHash}:${status}`,
    });

    this.logger.log(
      `Contribution ${contributionId} settled as ${status} for tx ${transactionHash}`,
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
