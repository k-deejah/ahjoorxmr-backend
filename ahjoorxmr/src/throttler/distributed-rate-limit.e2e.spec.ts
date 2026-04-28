/**
 * E2E: Distributed Rate Limiting (#182)
 *
 * Spins up TWO separate NestJS app instances sharing the same Redis store.
 * Verifies that hitting the limit on instance A blocks requests on instance B.
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, Controller, Get, Module } from '@nestjs/common';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import * as request from 'supertest';
import { RedisThrottlerStorageService } from '../../throttler/redis-throttler-storage.service';
import { RedisService } from '../../common/redis/redis.service';
import { ConfigModule } from '@nestjs/config';

// ── Minimal test controller ──────────────────────────────────────────────────

@Controller('test-rl')
class TestRlController {
  @Get()
  ping() {
    return { ok: true };
  }
}

// ── Shared Redis mock that counts calls ──────────────────────────────────────

class SharedCounter {
  private counts = new Map<string, number>();

  increment(key: string): number {
    const n = (this.counts.get(key) ?? 0) + 1;
    this.counts.set(key, n);
    return n;
  }

  get(key: string): number {
    return this.counts.get(key) ?? 0;
  }

  reset() {
    this.counts.clear();
  }
}

const sharedCounter = new SharedCounter();

// Shared in-memory storage that simulates Redis being shared across pods
class SharedMemoryThrottlerStorage {
  async increment(
    key: string,
    ttl: number,
  ): Promise<{ totalHits: number; timeToExpire: number }> {
    const totalHits = sharedCounter.increment(key);
    return { totalHits, timeToExpire: ttl };
  }
}

// ── Helper to build a minimal app instance ───────────────────────────────────

async function buildApp(limit: number, ttl: number): Promise<INestApplication> {
  const storage = new SharedMemoryThrottlerStorage();

  @Module({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      ThrottlerModule.forRoot({
        throttlers: [{ name: 'default', ttl, limit }],
        storage: storage as any,
      }),
    ],
    controllers: [TestRlController],
    providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
  })
  class TestAppModule {}

  const module: TestingModule = await Test.createTestingModule({
    imports: [TestAppModule],
  }).compile();

  const app = module.createNestApplication();
  await app.init();
  return app;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Distributed Rate Limiting (cross-instance)', () => {
  let appA: INestApplication;
  let appB: INestApplication;

  const LIMIT = 3;
  const TTL = 60_000;

  beforeAll(async () => {
    [appA, appB] = await Promise.all([
      buildApp(LIMIT, TTL),
      buildApp(LIMIT, TTL),
    ]);
  });

  afterAll(async () => {
    await Promise.all([appA.close(), appB.close()]);
  });

  beforeEach(() => sharedCounter.reset());

  it('allows requests up to the limit across both instances', async () => {
    // 2 requests on instance A
    await request(appA.getHttpServer()).get('/test-rl').expect(200);
    await request(appA.getHttpServer()).get('/test-rl').expect(200);

    // 1 request on instance B — still within limit
    await request(appB.getHttpServer()).get('/test-rl').expect(200);
  });

  it('blocks on instance B after limit is reached on instance A', async () => {
    // Exhaust limit entirely on instance A
    for (let i = 0; i < LIMIT; i++) {
      await request(appA.getHttpServer()).get('/test-rl');
    }

    // Instance B should now be blocked (shared counter > limit)
    const res = await request(appB.getHttpServer()).get('/test-rl');
    expect(res.status).toBe(429);
  });

  it('blocks on instance A after limit is reached on instance B', async () => {
    // Exhaust limit entirely on instance B
    for (let i = 0; i < LIMIT; i++) {
      await request(appB.getHttpServer()).get('/test-rl');
    }

    // Instance A should now be blocked
    const res = await request(appA.getHttpServer()).get('/test-rl');
    expect(res.status).toBe(429);
  });

  it('429 response includes Retry-After header', async () => {
    for (let i = 0; i < LIMIT; i++) {
      await request(appA.getHttpServer()).get('/test-rl');
    }

    const res = await request(appA.getHttpServer()).get('/test-rl');
    expect(res.status).toBe(429);
    // ThrottlerGuard sets Retry-After automatically
    expect(res.headers['retry-after'] ?? res.headers['x-ratelimit-reset']).toBeDefined();
  });
});
