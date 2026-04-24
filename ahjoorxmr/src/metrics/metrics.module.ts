import { Module } from '@nestjs/common';
import { PrometheusModule } from '@willsoto/nestjs-prometheus';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';
import { MetricsInterceptor } from './metrics.interceptor';

@Module({
  imports: [
    PrometheusModule.register({
      defaultMetrics: {
        enabled: true,
      },
    }),
  ],
  controllers: [MetricsController],
  providers: [
    MetricsService,
    MetricsInterceptor,
    {
      provide: 'PROM_METRIC_HTTP_REQUESTS_TOTAL',
      useFactory: () => {
        const { Counter } = require('prom-client');
        return new Counter({
          name: 'http_requests_total',
          help: 'Total number of HTTP requests',
          labelNames: ['method', 'route', 'status'],
        });
      },
    },
    {
      provide: 'PROM_METRIC_HTTP_REQUEST_DURATION_SECONDS',
      useFactory: () => {
        const { Histogram } = require('prom-client');
        return new Histogram({
          name: 'http_request_duration_seconds',
          help: 'HTTP request duration in seconds',
          labelNames: ['method', 'route', 'status'],
          buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
        });
      },
    },
    {
      provide: 'PROM_METRIC_BULLMQ_JOBS_TOTAL',
      useFactory: () => {
        const { Counter } = require('prom-client');
        return new Counter({
          name: 'bullmq_jobs_total',
          help: 'Total number of BullMQ jobs',
          labelNames: ['queue', 'state'],
        });
      },
    },
    {
      provide: 'PROM_METRIC_STELLAR_TRANSACTIONS_TOTAL',
      useFactory: () => {
        const { Counter } = require('prom-client');
        return new Counter({
          name: 'stellar_transactions_total',
          help: 'Total number of Stellar transactions',
          labelNames: ['status'],
        });
      },
    },
    {
      provide: 'PROM_METRIC_DB_POOL_ACTIVE_CONNECTIONS',
      useFactory: () => {
        const { Gauge } = require('prom-client');
        return new Gauge({
          name: 'db_pool_active_connections',
          help: 'Number of active database connections',
        });
      },
    },
  ],
  exports: [MetricsService, MetricsInterceptor],
})
export class MetricsModule {}
