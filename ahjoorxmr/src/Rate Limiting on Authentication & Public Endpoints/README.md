# Rate Limiting with `@nestjs/throttler`

This service uses [`@nestjs/throttler`](https://github.com/nestjs/throttler) with **Redis-backed storage** to protect endpoints from brute-force and DDoS attacks. Rate-limit state is shared across all service instances, making it safe for horizontal scaling.

---

## Configuration

### Install dependencies

```bash
npm install @nestjs/throttler @nest-lab/throttler-storage-redis ioredis
```

### Environment variables

| Variable         | Default     | Description                   |
|------------------|-------------|-------------------------------|
| `REDIS_HOST`     | `localhost` | Redis host                    |
| `REDIS_PORT`     | `6379`      | Redis port                    |
| `REDIS_PASSWORD` | *(none)*    | Redis password (if required)  |

---

## Rate Limits

| Endpoint              | Method | Limit              | Storage |
|-----------------------|--------|--------------------|---------|
| `/auth/challenge`     | POST   | **5 req / minute** | Redis   |
| `/auth/verify`        | POST   | **10 req / minute**| Redis   |
| `/groups`             | GET    | 60 req / minute    | Redis   |
| `/health`             | GET    | ∞ (exempt)         | —       |
| `/health/ready`       | GET    | ∞ (exempt)         | —       |

---

## How It Works

### Global guard (`app.module.ts`)

```typescript
ThrottlerModule.forRoot({
  throttlers: [{ name: 'default', ttl: 60000, limit: 60 }],
  storage: new ThrottlerStorageRedisService(redisClient),
}),

// In providers:
{ provide: APP_GUARD, useClass: ThrottlerGuard }
```

The `APP_GUARD` registration applies throttling to **every route** by default.

### Per-endpoint overrides (`@Throttle`)

```typescript
// 5 req/min
@Throttle({ default: { ttl: 60000, limit: 5 } })
@Post('challenge')
async challenge(...) {}

// 10 req/min
@Throttle({ default: { ttl: 60000, limit: 10 } })
@Post('verify')
async verify(...) {}
```

### Exempting health endpoints (`@SkipThrottle`)

```typescript
@SkipThrottle()   // <-- applied at controller level
@Controller('health')
export class HealthController {
  @Get()       health() { ... }
  @Get('ready') ready() { ... }
}
```

---

## Response Headers

When a request is counted against the rate limit, NestJS throttler automatically adds:

| Header                  | Description                             |
|-------------------------|-----------------------------------------|
| `X-RateLimit-Limit`     | Maximum requests allowed in the window  |
| `X-RateLimit-Remaining` | Requests left in the current window     |
| `Retry-After`           | Seconds until the window resets (on 429)|

---

## Running Integration Tests

```bash
# e2e tests (no Redis required — uses in-memory storage in test env)
npm run test:e2e
```

Tests verify:
- `POST /auth/challenge` returns `429` after the 5th request.
- `POST /auth/verify` returns `429` after the 10th request.
- `GET /health` and `GET /health/ready` never return `429` regardless of call volume.
- Throttle response headers are present on successful responses.

---

## Architecture Note

Redis is used as the throttle store so that **all instances** of the service share rate-limit counters. Without Redis, each instance would maintain its own in-memory counter, allowing clients to bypass limits simply by hitting different pods.
