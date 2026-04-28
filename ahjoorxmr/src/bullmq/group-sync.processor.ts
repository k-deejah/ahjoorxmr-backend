import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Job, Queue } from 'bullmq';
import { context, trace } from '@opentelemetry/api';
import {
  QUEUE_NAMES,
  JOB_NAMES,
  BACKOFF_DELAYS,
  RETRY_CONFIG,
} from './queue.constants';
import {
  SyncGroupStateJobData,
  SyncAllGroupsJobData,
} from './queue.interfaces';
import { DeadLetterService } from './dead-letter.service';
import { StellarService } from '../stellar/stellar.service';
import { Group } from '../groups/entities/group.entity';
import { GroupStatus } from '../groups/entities/group-status.enum';
import { RedlockService } from '../common/redis/redlock.service';
import { extractTraceContext } from '../common/tracing/stellar-tracing';

@Processor(QUEUE_NAMES.GROUP_SYNC, { concurrency: 2 })
export class GroupSyncProcessor extends WorkerHost {
  private readonly logger = new Logger(GroupSyncProcessor.name);

  constructor(
    private readonly deadLetterService: DeadLetterService,
    private readonly stellarService: StellarService,
    private readonly redlockService: RedlockService,
    private readonly configService: ConfigService,
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    @InjectQueue(QUEUE_NAMES.GROUP_SYNC)
    private readonly groupSyncQueue: Queue,
  ) {
    super();
  }

  async onModuleDestroy(): Promise<void> {
    this.logger.log(
      `[${new Date().toISOString()}] Closing GroupSyncProcessor worker, draining active jobs...`,
    );
    try {
      await this.worker?.close();
      this.logger.log(
        `[${new Date().toISOString()}] GroupSyncProcessor worker closed successfully`,
      );
    } catch (error) {
      this.logger.error(
        `[${new Date().toISOString()}] Error closing GroupSyncProcessor worker: ${error.message}`,
      );
    }
  }

  async process(job: Job): Promise<unknown> {
    this.logger.debug(`Processing group-sync job [${job.name}] id=${job.id}`);

    // Restore W3C trace context propagated from the enqueuing request
    const traceCarrier: Record<string, string> =
      (job.data as any)._traceContext ?? {};
    const parentCtx = extractTraceContext(traceCarrier);

    return context.with(parentCtx, () => {
      switch (job.name) {
        case JOB_NAMES.SYNC_GROUP_STATE:
          return this.handleSyncGroupState(job as Job<SyncGroupStateJobData>);
        case JOB_NAMES.SYNC_ALL_GROUPS:
          return this.handleSyncAllGroups(job as Job<SyncAllGroupsJobData>);
        default:
          throw new Error(`Unknown group-sync job type: ${job.name}`);
      }
    });
  }

  private async handleSyncGroupState(
    job: Job<SyncGroupStateJobData>,
  ): Promise<{ status: 'PROCESSED' | 'SKIPPED' }> {
    const { groupId, contractAddress, forceSync } = job.data;
    this.logger.log(
      `Syncing group state groupId=${groupId} contract=${contractAddress} force=${forceSync ?? false}`,
    );

    const maxExpectedDurationMs = Number(
      this.configService.get<string>(
        'MEDIATION_MAX_EXPECTED_DURATION_MS',
        '25000',
      ),
    );
    const lockTtlMs = Number(
      this.configService.get<string>(
        'MEDIATION_LOCK_TTL_MS',
        String(Math.ceil(maxExpectedDurationMs * 1.2)),
      ),
    );

    const lockKey = `mediation:group:${groupId}`;
    const lock = await this.redlockService.acquire(lockKey, lockTtlMs);
    if (!lock) {
      this.logger.warn(
        `Mediation lock unavailable for group ${groupId}; marking job as SKIPPED`,
      );
      return { status: 'SKIPPED' };
    }

    try {
      const group = await this.groupRepository.findOne({
        where: { id: groupId },
      });
      if (!group) {
        this.logger.warn(`Group ${groupId} not found, skipping sync`);
        return { status: 'PROCESSED' };
      }

      const state = (await this.stellarService.getGroupState(
        contractAddress,
      )) as Record<string, unknown> | null;
      if (!state) {
        this.logger.warn(`No state returned for contract=${contractAddress}`);
        return { status: 'PROCESSED' };
      }

      let changed = false;

      const onChainRound =
        typeof state['current_round'] === 'number'
          ? state['current_round']
          : null;
      if (onChainRound !== null && onChainRound !== group.currentRound) {
        this.logger.log(
          `Group ${groupId} round ${group.currentRound} → ${onChainRound}`,
        );
        group.currentRound = onChainRound;
        changed = true;
      }

      const onChainStatus =
        typeof state['status'] === 'string'
          ? state['status'].toUpperCase()
          : null;
      if (
        onChainStatus &&
        onChainStatus !== group.status &&
        Object.values(GroupStatus).includes(onChainStatus as GroupStatus)
      ) {
        this.logger.log(
          `Group ${groupId} status ${group.status} → ${onChainStatus}`,
        );
        group.status = onChainStatus as GroupStatus;
        changed = true;
      }

      if (changed) {
        group.staleAt = null;
        await this.groupRepository.save(group);
        this.logger.log(`Group ${groupId} synced successfully`);
      } else {
        this.logger.debug(`Group ${groupId} already in sync`);
      }

      return { status: 'PROCESSED' };
    } finally {
      await this.redlockService.release(lock);
    }
  }

  private async handleSyncAllGroups(
    job: Job<SyncAllGroupsJobData>,
  ): Promise<void> {
    const { batchSize = 50 } = job.data;
    this.logger.log(
      `Paginated sync of all ACTIVE groups batchSize=${batchSize}`,
    );

    let page = 0;
    let dispatched = 0;

    while (true) {
      const groups = await this.groupRepository.find({
        where: { status: GroupStatus.ACTIVE },
        select: ['id', 'contractAddress'],
        skip: page * batchSize,
        take: batchSize,
      });

      if (groups.length === 0) break;

      const jobs = groups
        .filter((g) => g.contractAddress)
        .map((g) => ({
          name: JOB_NAMES.SYNC_GROUP_STATE,
          data: {
            groupId: g.id,
            contractAddress: g.contractAddress!,
            chainId: job.data.chainId,
          } as SyncGroupStateJobData,
          opts: {
            jobId: g.id,
            attempts: RETRY_CONFIG.attempts,
            backoff: RETRY_CONFIG.backoff,
          },
        }));

      if (jobs.length > 0) {
        await this.groupSyncQueue.addBulk(jobs);
        dispatched += jobs.length;
      }

      if (groups.length < batchSize) break;
      page++;
    }

    this.logger.log(`Dispatched ${dispatched} SYNC_GROUP_STATE jobs`);
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
