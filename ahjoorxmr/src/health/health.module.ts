import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';
import { DatabaseHealthService } from './database-health.service';

@Module({
  controllers: [HealthController],
  providers: [HealthService, DatabaseHealthService],
  exports: [DatabaseHealthService],
})
export class HealthModule {}
