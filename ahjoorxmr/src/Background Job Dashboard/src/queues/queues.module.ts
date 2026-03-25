import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { BullBoardModule } from '@bull-board/nestjs';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { EmailProcessor } from './email.processor';
import { NotificationsProcessor } from './notifications.processor';
import { PaymentsProcessor } from './payments.processor';

@Module({
  imports: [
    // Register BullMQ queues
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT) || 6379,
      },
    }),
    BullModule.registerQueue(
      { name: 'email' },
      { name: 'notifications' },
      { name: 'payments' },
    ),
    // Register queues with Bull Board
    BullBoardModule.forFeature(
      {
        name: 'email',
        adapter: BullMQAdapter,
      },
      {
        name: 'notifications',
        adapter: BullMQAdapter,
      },
      {
        name: 'payments',
        adapter: BullMQAdapter,
      },
    ),
  ],
  providers: [EmailProcessor, NotificationsProcessor, PaymentsProcessor],
  exports: [BullModule],
})
export class QueuesModule {}
