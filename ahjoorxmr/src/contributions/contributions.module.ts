import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ContributionsController } from './contributions.controller';
import { ContributionsService } from './contributions.service';
import { Contribution } from './entities/contribution.entity';
import { Group } from '../groups/entities/group.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { User } from '../users/entities/user.entity';
import { WinstonLogger } from '../common/logger/winston.logger';
import { ApiKeyGuard } from './guards/api-key.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { StellarModule } from '../stellar/stellar.module';
import { ConfigModule } from '@nestjs/config';
import { GroupsModule } from '../groups/groups.module';
import { NotificationsModule } from '../notification/notifications.module';
import { WebhookModule } from '../webhooks/webhook.module';
import { QueueModule } from '../bullmq/queue.module';

/**
 * ContributionsModule manages member contributions in a group-based ROSCA system.
 * Provides REST API endpoints for recording and querying contribution history.
 * Enforces business rules around duplicate prevention and data integrity.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Contribution, Group, Membership, User]),
    StellarModule,
    ConfigModule,
    GroupsModule,
    NotificationsModule,
    forwardRef(() => WebhookModule),
    forwardRef(() => QueueModule),
  ],
  controllers: [ContributionsController],
  providers: [ContributionsService, WinstonLogger, ApiKeyGuard, JwtAuthGuard],
  exports: [ContributionsService],
})
export class ContributionsModule {}
