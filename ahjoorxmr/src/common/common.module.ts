import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SlowRequestLogService } from './services/slow-request-log.service';
import { SlowRequestsAdminController } from './controllers/slow-requests-admin.controller';
import { DeprecationUsageController } from './controllers/deprecation-usage.controller';
import { DeprecationUsageService } from './services/deprecation-usage.service';
import { AuditLog } from '../audit/entities/audit-log.entity';

/**
 * Common module for shared services and controllers
 */
@Module({
  imports: [TypeOrmModule.forFeature([AuditLog])],
  controllers: [SlowRequestsAdminController, DeprecationUsageController],
  providers: [SlowRequestLogService, DeprecationUsageService],
  exports: [SlowRequestLogService, DeprecationUsageService],
})
export class CommonModule {}
