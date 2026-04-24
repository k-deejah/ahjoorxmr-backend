import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { Webhook } from './entities/webhook.entity';
import { WebhookService } from './webhook.service';
import { WebhookController } from './webhook.controller';
import { WebhookDeliveryProcessor } from './webhook-delivery.processor';
import { DeadLetterService } from '../bullmq/dead-letter.service';

@Module({
  imports: [
    TypeOrmModule.forFeature([Webhook]),
    BullModule.registerQueue({
      name: 'webhook-delivery-queue',
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: { count: 1000, age: 24 * 60 * 60 },
        removeOnFail: false,
      },
    }),
    ConfigModule,
  ],
  controllers: [WebhookController],
  providers: [WebhookService, WebhookDeliveryProcessor, DeadLetterService],
  exports: [WebhookService],
})
export class WebhookModule {}
