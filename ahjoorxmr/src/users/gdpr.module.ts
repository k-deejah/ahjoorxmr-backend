import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GdprService } from './gdpr.service';
import { GdprProcessor } from './gdpr.processor';
import { User } from './entities/user.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { Contribution } from '../contributions/entities/contribution.entity';
import { KycDocument } from '../kyc/entities/kyc-document.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { Notification } from '../notification/notification.entity';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { Group } from '../groups/entities/group.entity';
import { MailModule } from '../mail/mail.module';
import { GDPR_QUEUE_NAME } from './gdpr.constants';

@Module({
  imports: [
    ConfigModule,
    MailModule,
    TypeOrmModule.forFeature([
      User,
      Membership,
      Contribution,
      KycDocument,
      AuditLog,
      Notification,
      RefreshToken,
      Group,
    ]),
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => ({
        connection: {
          host: configService.get<string>('REDIS_HOST', 'localhost'),
          port: configService.get<number>('REDIS_PORT', 6379),
          password: configService.get<string>('REDIS_PASSWORD'),
          maxRetriesPerRequest: null,
        },
      }),
      inject: [ConfigService],
    }),
    BullModule.registerQueue({
      name: GDPR_QUEUE_NAME,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: { count: 100 },
        removeOnFail: false,
      },
    }),
  ],
  providers: [GdprService, GdprProcessor],
  exports: [GdprService],
})
export class GdprModule {}
