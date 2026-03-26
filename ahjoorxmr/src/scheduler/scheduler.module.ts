import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { SchedulerService } from './scheduler.service';
import { AuditLogService } from './services/audit-log.service';
import { ContributionSummaryService } from './services/contribution-summary.service';
import { GroupStatusService } from './services/group-status.service';
import { StaleGroupDetectionService } from './services/stale-group-detection.service';
import { DistributedLockService } from './services/distributed-lock.service';
import { RoundAdvanceService } from './services/round-advance.service';
import { AuditLog } from './entities/audit-log.entity';
import { Contribution } from '../contributions/entities/contribution.entity';
import { Group } from '../groups/entities/group.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { NotificationsService } from '../notification/notifications.service';
import { Notification } from '../notification/notification.entity';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    ConfigModule,
    TypeOrmModule.forFeature([AuditLog, Contribution, Group, Membership, Notification]),
  ],
  providers: [
    SchedulerService,
    AuditLogService,
    ContributionSummaryService,
    GroupStatusService,
    StaleGroupDetectionService,
    DistributedLockService,
    NotificationsService,
    RoundAdvanceService,
  ],
  exports: [AuditLogService],
})
export class SchedulerModule {}
