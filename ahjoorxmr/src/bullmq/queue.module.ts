import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';

import { QUEUE_NAMES, BACKOFF_DELAYS, RETRY_CONFIG } from './queue.constants';
import { QueueService } from './queue.service';
import { QueueAdminController } from './queue-admin.controller';
import { DeadLetterService } from './dead-letter.service';
import { BullBoardService } from './bull-board.service';
import { EmailProcessor } from './email.processor';
import { EventSyncProcessor } from './event-sync.processor';
import { GroupSyncProcessor } from './group-sync.processor';
import { MailModule } from '../mail/mail.module';

/**
 * Custom backoff strategy registered globally via BullMQ worker options.
 * Delays: attempt 0 → 1 s, attempt 1 → 5 s, attempt 2+ → 30 s.
 */
function customBackoffStrategy(attemptsMade: number): number {
  return (
    BACKOFF_DELAYS[attemptsMade] ?? BACKOFF_DELAYS[BACKOFF_DELAYS.length - 1]
  );
}

// Shared default job options applied at the queue level
const sharedQueueOptions = {
  defaultJobOptions: {
    attempts: RETRY_CONFIG.attempts,
    backoff: { type: 'custom' as const },
    removeOnComplete: { count: 1000, age: 86_400 },
    removeOnFail: false,
  },
};

@Module({
  imports: [
    ConfigModule,
    MailModule,

    // Register BullMQ with the shared ioredis client from RedisModule
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get<string>('REDIS_PASSWORD'),
          tls:
            configService.get<string>('REDIS_TLS') === 'true' ? {} : undefined,
          maxRetriesPerRequest: null, // required by BullMQ
        },
        // Register our custom backoff strategy globally
        settings: {
          backoffStrategy: customBackoffStrategy,
        },
      }),
      inject: [ConfigService],
    }),

    // Register all queues
    BullModule.registerQueue(
      { name: QUEUE_NAMES.EMAIL, ...sharedQueueOptions },
      { name: QUEUE_NAMES.EVENT_SYNC, ...sharedQueueOptions },
      { name: QUEUE_NAMES.GROUP_SYNC, ...sharedQueueOptions },
      {
        name: QUEUE_NAMES.DEAD_LETTER,
        defaultJobOptions: { removeOnComplete: false, removeOnFail: false },
      },
    ),
  ],
  controllers: [QueueAdminController],
  providers: [
    DeadLetterService,
    QueueService,
    BullBoardService,
    EmailProcessor,
    EventSyncProcessor,
    GroupSyncProcessor,
  ],
  exports: [
    QueueService,
    BullBoardService,
    // Re-export BullModule so consuming modules can inject the queues directly if needed
    BullModule,
  ],
})
export class QueueModule {}
