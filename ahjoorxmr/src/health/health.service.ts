import { Injectable } from '@nestjs/common';
import {
  HealthResponseDto,
  ReadinessResponseDto,
} from './dto/health-response.dto';
import { DatabaseHealthService } from './database-health.service';

@Injectable()
export class HealthService {
  constructor(private readonly databaseHealthService: DatabaseHealthService) {}

  async getHealthStatus(): Promise<HealthResponseDto> {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      environment: process.env.NODE_ENV || 'development',
      version: process.env.npm_package_version || '0.0.1',
    };
  }

  async getReadinessStatus(): Promise<ReadinessResponseDto> {
    const dbHealth = await this.databaseHealthService.isDatabaseHealthy();
    const poolStats = await this.databaseHealthService.getPoolStats();

    return {
      status: dbHealth.isHealthy ? 'ready' : 'not_ready',
      timestamp: new Date().toISOString(),
      checks: {
        database: dbHealth.isHealthy ? 'ok' : 'failed',
        databaseResponseTime: `${dbHealth.responseTime}ms`,
        connectionPool: poolStats || 'unavailable',
        memory: this.getMemoryUsage(),
      },
    };
  }

  async getDatabaseHealth(): Promise<any> {
    return this.databaseHealthService.getHealthReport();
  }

  private getMemoryUsage() {
    const memUsage = process.memoryUsage();
    return {
      rss: `${Math.round(memUsage.rss / 1024 / 1024)} MB`,
      heapTotal: `${Math.round(memUsage.heapTotal / 1024 / 1024)} MB`,
      heapUsed: `${Math.round(memUsage.heapUsed / 1024 / 1024)} MB`,
      external: `${Math.round(memUsage.external / 1024 / 1024)} MB`,
    };
  }
}
