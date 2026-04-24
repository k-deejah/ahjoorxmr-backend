import { Module, forwardRef } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { QueryAnalysis } from './entities/query-analysis.entity';
import { QueryPerformanceService } from './services/query-performance.service';
import { DbAdminController } from './controllers/db-admin.controller';
import { SlowQueryLogger } from './interceptors/slow-query.interceptor';
import { NotificationModule } from '../notification/notifications.module';
import { DatabasePoolMonitor } from './services/database-pool-monitor.service';
import { MetricsModule } from '../metrics/metrics.module';

/**
 * Module for database performance monitoring and analysis
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([QueryAnalysis]),
    NotificationModule,
    forwardRef(() => MetricsModule),
  ],
  controllers: [DbAdminController],
  providers: [QueryPerformanceService, SlowQueryLogger, DatabasePoolMonitor],
  exports: [QueryPerformanceService, SlowQueryLogger, DatabasePoolMonitor],
})
export class DatabasePerformanceModule {}
