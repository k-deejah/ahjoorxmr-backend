import { Injectable, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { MetricsService } from '../metrics/metrics.service';

@Injectable()
export class DatabasePoolMonitor implements OnModuleInit {
  private monitorInterval: NodeJS.Timeout;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly metricsService: MetricsService,
  ) {}

  onModuleInit() {
    // Update metrics every 10 seconds
    this.monitorInterval = setInterval(() => {
      this.updatePoolMetrics();
    }, 10000);
  }

  onModuleDestroy() {
    if (this.monitorInterval) {
      clearInterval(this.monitorInterval);
    }
  }

  private updatePoolMetrics() {
    try {
      const driver = this.dataSource.driver as any;
      const pool = driver?.master || driver?.pool;
      
      if (pool) {
        const activeConnections = pool.totalCount || pool._allObjects?.length || 0;
        this.metricsService.setDbPoolActiveConnections(activeConnections);
      }
    } catch (error) {
      // Silently fail if pool info is not available
    }
  }
}
