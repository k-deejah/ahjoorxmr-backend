# Metrics Module

This module provides Prometheus metrics for monitoring the Ahjoorxmr backend application.

## Features

- **HTTP Request Metrics**: Track request rate, duration, and status codes
- **BullMQ Job Metrics**: Monitor job completion and failure rates by queue
- **Stellar Transaction Metrics**: Track blockchain transaction success/failure rates
- **Database Pool Metrics**: Monitor active database connections

## Metrics Endpoint

The metrics are exposed at `GET /metrics` and protected by an API key.

### Authentication

Set the `METRICS_API_KEY` environment variable and include it in the request header:

```bash
curl -H "x-api-key: your-api-key-here" http://localhost:3000/metrics
```

## Available Metrics

### HTTP Metrics

- `http_requests_total` (Counter): Total number of HTTP requests
  - Labels: `method`, `route`, `status`
- `http_request_duration_seconds` (Histogram): HTTP request duration in seconds
  - Labels: `method`, `route`, `status`
  - Buckets: 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10

### BullMQ Metrics

- `bullmq_jobs_total` (Counter): Total number of BullMQ jobs
  - Labels: `queue`, `state`

### Stellar Metrics

- `stellar_transactions_total` (Counter): Total number of Stellar transactions
  - Labels: `status` (success/failure)

### Database Metrics

- `db_pool_active_connections` (Gauge): Number of active database connections

### Default Metrics

The module also exposes Node.js default metrics including:
- Process CPU usage
- Process memory usage
- Event loop lag
- Garbage collection stats

## Grafana Dashboard

A pre-configured Grafana dashboard is available at `docs/grafana-dashboard.json`.

### Dashboard Panels

1. **HTTP Request Rate**: Requests per second by route and method
2. **HTTP Request Latency**: p95 and p99 latency percentiles
3. **BullMQ Job Rate**: Job processing rate by queue and state
4. **Database Pool Active Connections**: Current active connections gauge
5. **Stellar Transaction Rate**: Success vs failure transaction rates
6. **Stellar Error Rate**: Percentage of failed transactions

### Importing the Dashboard

1. Open Grafana
2. Navigate to Dashboards → Import
3. Upload `docs/grafana-dashboard.json`
4. Select your Prometheus datasource
5. Click Import

## Configuration

Add to your `.env` file:

```env
METRICS_API_KEY=your-strong-random-secret-here
```

## Usage in Code

### Tracking Custom Metrics

Inject the `MetricsService` to track custom metrics:

```typescript
import { MetricsService } from './metrics/metrics.service';

@Injectable()
export class MyService {
  constructor(private readonly metricsService: MetricsService) {}

  async processJob() {
    // Track BullMQ job completion
    this.metricsService.incrementBullMQJob('my-queue', 'completed');
  }

  async stellarTransaction() {
    try {
      // ... stellar transaction logic
      this.metricsService.incrementStellarTransaction(true);
    } catch (error) {
      this.metricsService.incrementStellarTransaction(false);
    }
  }
}
```

## Testing

Run the unit tests:

```bash
npm test -- metrics
```

## Prometheus Configuration

Add this job to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: 'ahjoorxmr-backend'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/metrics'
    scheme: 'http'
    authorization:
      type: Bearer
      credentials: 'your-api-key-here'
    # Or use custom header
    params:
      x-api-key: ['your-api-key-here']
```

## Security

- The `/metrics` endpoint requires authentication via the `x-api-key` header
- Returns 401 Unauthorized if the API key is missing or invalid
- Keep your `METRICS_API_KEY` secure and rotate it regularly
