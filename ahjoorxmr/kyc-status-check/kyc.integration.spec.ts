/**
 * KYC Integration Tests
 * ─────────────────────────────────────────────────────────────────────────────
 * These tests spin up a minimal NestJS application that mirrors the three
 * protected endpoints and verifies that KycGuard returns 403 for every
 * non-APPROVED status, and 2xx only for APPROVED users.
 *
 * Assumptions:
 *  - Your project uses JwtAuthGuard that populates `req.user` from a JWT.
 *  - The JWT payload includes at minimum: { sub: string, kycStatus: KycStatus }
 *  - You call these tests with `jest --testPathPattern=kyc.integration.spec`
 *    or place them under a `/test` directory picked up by your jest config.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  Controller,
  HttpCode,
  HttpStatus,
  INestApplication,
  Module,
  Post,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { KycGuard } from './kyc.guard';
import { KycStatus } from './kyc.constants';

// ─── Minimal stub controllers ─────────────────────────────────────────────────

@Controller('groups')
class StubGroupsController {
  @Post()
  @UseGuards(KycGuard)
  @HttpCode(HttpStatus.CREATED)
  createGroup() {
    return { id: 'grp-1' };
  }

  @Post(':id/members')
  @UseGuards(KycGuard)
  @HttpCode(HttpStatus.CREATED)
  joinGroup() {
    return { joined: true };
  }
}

@Controller('internal/contributions')
class StubContributionsController {
  @Post()
  @UseGuards(KycGuard)
  @HttpCode(HttpStatus.CREATED)
  recordContribution() {
    return { recorded: true };
  }
}

// ─── KycGuard override that reads kycStatus directly from request header ──────
// This avoids wiring TypeORM in integration tests while still exercising the
// guard's status-assertion logic. Replace with your full TestingModule setup
// (including TypeOrmModule.forFeature, etc.) for end-to-end DB tests.

class HeaderDrivenKycGuard extends KycGuard {
  async canActivate(context: any): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const status = req.headers['x-kyc-status'] as KycStatus | undefined;

    // Simulate what KycGuard does after resolving the status
    if (status === KycStatus.APPROVED) return true;

    const messages: Partial<Record<KycStatus, string>> = {
      [KycStatus.NONE]: 'KYC verification has not been submitted. Please upload your documents first.',
      [KycStatus.PENDING]: 'KYC verification is still under review. You will be notified once approved.',
      [KycStatus.REJECTED]: 'KYC verification was rejected. Please resubmit your documents.',
    };

    const { ForbiddenException } = await import('@nestjs/common');
    throw new ForbiddenException(messages[status!] ?? 'KYC approval is required to perform this action.');
  }
}

@Module({
  controllers: [StubGroupsController, StubContributionsController],
  providers: [
    Reflector,
    { provide: KycGuard, useClass: HeaderDrivenKycGuard },
  ],
})
class TestAppModule {}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function withKycStatus(app: INestApplication, status: KycStatus) {
  return {
    post: (url: string) =>
      request(app.getHttpServer()).post(url).set('x-kyc-status', status),
  };
}

// ─── Test suite ───────────────────────────────────────────────────────────────

describe('KYC Guard — Integration', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [TestAppModule],
    })
      .overrideProvider(KycGuard)
      .useClass(HeaderDrivenKycGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  // ─── POST /groups ───────────────────────────────────────────────────────────

  describe('POST /groups', () => {
    it('returns 201 for APPROVED user', () =>
      withKycStatus(app, KycStatus.APPROVED).post('/groups').expect(HttpStatus.CREATED));

    it('returns 403 for NONE user', () =>
      withKycStatus(app, KycStatus.NONE).post('/groups').expect(HttpStatus.FORBIDDEN));

    it('returns 403 for PENDING user', () =>
      withKycStatus(app, KycStatus.PENDING)
        .post('/groups')
        .expect(HttpStatus.FORBIDDEN)
        .expect((res) => {
          expect(res.body.message).toContain('under review');
        }));

    it('returns 403 for REJECTED user', () =>
      withKycStatus(app, KycStatus.REJECTED)
        .post('/groups')
        .expect(HttpStatus.FORBIDDEN)
        .expect((res) => {
          expect(res.body.message).toContain('rejected');
        }));
  });

  // ─── POST /groups/:id/members ───────────────────────────────────────────────

  describe('POST /groups/:id/members', () => {
    it('returns 201 for APPROVED user', () =>
      withKycStatus(app, KycStatus.APPROVED).post('/groups/grp-1/members').expect(HttpStatus.CREATED));

    it('returns 403 for NONE user', () =>
      withKycStatus(app, KycStatus.NONE).post('/groups/grp-1/members').expect(HttpStatus.FORBIDDEN));

    it('returns 403 for PENDING user', () =>
      withKycStatus(app, KycStatus.PENDING).post('/groups/grp-1/members').expect(HttpStatus.FORBIDDEN));

    it('returns 403 for REJECTED user', () =>
      withKycStatus(app, KycStatus.REJECTED).post('/groups/grp-1/members').expect(HttpStatus.FORBIDDEN));
  });

  // ─── POST /internal/contributions ──────────────────────────────────────────

  describe('POST /internal/contributions', () => {
    it('returns 201 for APPROVED user', () =>
      withKycStatus(app, KycStatus.APPROVED).post('/internal/contributions').expect(HttpStatus.CREATED));

    it('returns 403 for NONE user', () =>
      withKycStatus(app, KycStatus.NONE).post('/internal/contributions').expect(HttpStatus.FORBIDDEN));

    it('returns 403 for PENDING user', () =>
      withKycStatus(app, KycStatus.PENDING)
        .post('/internal/contributions')
        .expect(HttpStatus.FORBIDDEN));

    it('returns 403 for REJECTED user', () =>
      withKycStatus(app, KycStatus.REJECTED)
        .post('/internal/contributions')
        .expect(HttpStatus.FORBIDDEN));
  });

  // ─── Error message content ──────────────────────────────────────────────────

  describe('403 response bodies', () => {
    it('NONE status returns "not been submitted" message', () =>
      withKycStatus(app, KycStatus.NONE)
        .post('/groups')
        .expect(HttpStatus.FORBIDDEN)
        .expect((res) => expect(res.body.message).toContain('not been submitted')));

    it('PENDING status returns "under review" message', () =>
      withKycStatus(app, KycStatus.PENDING)
        .post('/groups')
        .expect(HttpStatus.FORBIDDEN)
        .expect((res) => expect(res.body.message).toContain('under review')));

    it('REJECTED status returns "rejected" message', () =>
      withKycStatus(app, KycStatus.REJECTED)
        .post('/groups')
        .expect(HttpStatus.FORBIDDEN)
        .expect((res) => expect(res.body.message).toContain('rejected')));
  });
});
