import { Injectable } from '@nestjs/common';
import { InjectMetric } from '@willsoto/nestjs-prometheus';
import { Counter, Gauge } from 'prom-client';

@Injectable()
export class MetricsService {
  constructor(
    @InjectMetric('bullmq_jobs_total')
    private readonly bullmqJobsTotal: Counter<string>,
    @InjectMetric('stellar_transactions_total')
    private readonly stellarTransactionsTotal: Counter<string>,
    @InjectMetric('db_pool_active_connections')
    private readonly dbPoolActiveConnections: Gauge<string>,
  ) {}

  incrementBullMQJob(queue: string, state: string): void {
    this.bullmqJobsTotal.inc({ queue, state });
  }

  incrementStellarTransaction(success: boolean): void {
    this.stellarTransactionsTotal.inc({
      status: success ? 'success' : 'failure',
    });
  }

  setDbPoolActiveConnections(count: number): void {
    this.dbPoolActiveConnections.set(count);
  }
}
