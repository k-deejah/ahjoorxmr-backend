import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';

import { EventSyncProcessor, QUEUES } from './processors/event-sync.processor';
import {
  GroupSyncProcessor,
  GROUP_SYNC_QUEUE,
} from './processors/group-sync.processor';
import { ContributionsService } from './contributions/contributions.service';
import { StellarService } from './stellar/stellar.service';

import { OnChainEvent } from './entities/on-chain-event.entity';
import { ApprovalEvent } from './entities/approval-event.entity';
import { Contribution } from './entities/contribution.entity';
import { Group } from './entities/group.entity';

const DLQ_SUFFIX = ':dlq';

/**
 * Default job options shared across queues.
 * Failed jobs exhaust 3 attempts then move to the dead-letter queue.
 */
const defaultJobOptions = {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5_000 },
  removeOnComplete: { count: 500 },
  removeOnFail: false, // keep failed jobs for DLQ inspection
};

@Module({
  imports: [
    // ── Main queues ─────────────────────────────────────────────────────────
    BullModule.registerQueue(
      {
        name: QUEUES.EVENT_SYNC,
        defaultJobOptions,
        // BullMQ Pro dead-letter queue support (OSS equivalent: use a separate queue)
        // When a job exhausts its attempts it is moved here automatically.
        // For BullMQ OSS, wire a `failed` event listener in the processor and
        // re-add the job to the DLQ queue manually (see EventSyncProcessor.onFailed below).
      },
      {
        name: GROUP_SYNC_QUEUE,
        defaultJobOptions,
      },
    ),

    // ── Dead-letter queues (OSS pattern) ────────────────────────────────────
    BullModule.registerQueue(
      { name: `${QUEUES.EVENT_SYNC}${DLQ_SUFFIX}` },
      { name: `${GROUP_SYNC_QUEUE}${DLQ_SUFFIX}` },
    ),

    // ── TypeORM repositories ─────────────────────────────────────────────────
    TypeOrmModule.forFeature([
      OnChainEvent,
      ApprovalEvent,
      Contribution,
      Group,
    ]),
  ],
  providers: [
    EventSyncProcessor,
    GroupSyncProcessor,
    ContributionsService,
    StellarService,
  ],
  exports: [ContributionsService, StellarService],
})
export class QueuesModule {}
