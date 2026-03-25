import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import * as request from 'supertest';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard } from '@nestjs/throttler';
import { AuthModule } from '../src/auth/auth.module';
import { HealthModule } from '../src/health/health.module';
import { GroupsModule } from '../src/groups/groups.module';

/**
 * Uses in-memory throttler storage for tests (no Redis needed).
 * Override ThrottlerModule with very low limits to trigger 429 quickly.
 */
describe('Rate Limiting (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [{ name: 'default', ttl: 60000, limit: 60 }],
        }),
        AuthModule,
        HealthModule,
        GroupsModule,
      ],
      providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── POST /auth/challenge ──────────────────────────────────────────────────

  describe('POST /auth/challenge', () => {
    it('should return 200 on first request', async () => {
      await request(app.getHttpServer())
        .post('/auth/challenge')
        .send({ address: '0xABC' })
        .expect(HttpStatus.OK);
    });

    it('should return 429 after exceeding 5 req/min limit', async () => {
      // Build a fresh app with limit=5 for this test
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          ThrottlerModule.forRoot({
            throttlers: [{ name: 'default', ttl: 60000, limit: 5 }],
          }),
          AuthModule,
          HealthModule,
          GroupsModule,
        ],
        providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
      }).compile();

      const testApp = module.createNestApplication();
      await testApp.init();

      for (let i = 0; i < 5; i++) {
        await request(testApp.getHttpServer())
          .post('/auth/challenge')
          .send({ address: '0xABC' })
          .expect(HttpStatus.OK);
      }

      // 6th request must be throttled
      await request(testApp.getHttpServer())
        .post('/auth/challenge')
        .send({ address: '0xABC' })
        .expect(HttpStatus.TOO_MANY_REQUESTS);

      await testApp.close();
    });
  });

  // ─── POST /auth/verify ────────────────────────────────────────────────────

  describe('POST /auth/verify', () => {
    it('should return 429 after exceeding 10 req/min limit', async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          ThrottlerModule.forRoot({
            throttlers: [{ name: 'default', ttl: 60000, limit: 10 }],
          }),
          AuthModule,
          HealthModule,
          GroupsModule,
        ],
        providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
      }).compile();

      const testApp = module.createNestApplication();
      await testApp.init();

      for (let i = 0; i < 10; i++) {
        await request(testApp.getHttpServer())
          .post('/auth/verify')
          .send({ address: '0xABC', signature: '0xSIG' })
          .expect(HttpStatus.OK);
      }

      await request(testApp.getHttpServer())
        .post('/auth/verify')
        .send({ address: '0xABC', signature: '0xSIG' })
        .expect(HttpStatus.TOO_MANY_REQUESTS);

      await testApp.close();
    });
  });

  // ─── Health endpoints ──────────────────────────────────────────────────────

  describe('GET /health (SkipThrottle)', () => {
    it('should never throttle /health even at very low limit', async () => {
      const module: TestingModule = await Test.createTestingModule({
        imports: [
          ThrottlerModule.forRoot({
            throttlers: [{ name: 'default', ttl: 60000, limit: 1 }],
          }),
          AuthModule,
          HealthModule,
          GroupsModule,
        ],
        providers: [{ provide: APP_GUARD, useClass: ThrottlerGuard }],
      }).compile();

      const testApp = module.createNestApplication();
      await testApp.init();

      for (let i = 0; i < 20; i++) {
        await request(testApp.getHttpServer())
          .get('/health')
          .expect(HttpStatus.OK);
      }

      for (let i = 0; i < 20; i++) {
        await request(testApp.getHttpServer())
          .get('/health/ready')
          .expect(HttpStatus.OK);
      }

      await testApp.close();
    });
  });

  // ─── Response headers ─────────────────────────────────────────────────────

  describe('Throttle response headers', () => {
    it('should include X-RateLimit-Limit and X-RateLimit-Remaining headers', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/challenge')
        .send({ address: '0xDEF' });

      expect(res.headers).toHaveProperty('x-ratelimit-limit');
      expect(res.headers).toHaveProperty('x-ratelimit-remaining');
    });
  });
});
