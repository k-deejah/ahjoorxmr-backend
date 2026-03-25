/**
 * auth.e2e-spec.ts
 *
 * Integration tests for the SIWS authentication flow.
 * Uses a real Stellar keypair to generate valid signatures, and mocks
 * Redis + TypeORM so no external services are required.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { APP_GUARD } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getRedisToken } from '@nestjs-modules/ioredis';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as request from 'supertest';
import * as StellarSdk from '@stellar/stellar-sdk';
import * as crypto from 'crypto';

import { AuthModule } from '../../src/auth/auth.module';
import { UsersModule } from '../../src/users/users.module';
import { User } from '../../src/users/user.entity';
import { JwtAuthGuard } from '../../src/common/guards/jwt-auth.guard';
import { Reflector } from '@nestjs/core';

// ---------------------------------------------------------------------------
// Shared test state
// ---------------------------------------------------------------------------
let app: INestApplication;
let keypair: StellarSdk.Keypair;
let walletAddress: string;

const fakeUser: Partial<User> = {
  id: 'e2e-user-uuid',
  walletAddress: '',
  refreshTokenHash: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const mockUserRepository = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  update: jest.fn(),
};

const mockRedis = {
  set: jest.fn().mockResolvedValue('OK'),
  get: jest.fn(),
  del: jest.fn().mockResolvedValue(1),
};

// ---------------------------------------------------------------------------
// App bootstrap
// ---------------------------------------------------------------------------
beforeAll(async () => {
  keypair = StellarSdk.Keypair.random();
  walletAddress = keypair.publicKey();
  fakeUser.walletAddress = walletAddress;

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [
      ConfigModule.forRoot({ isGlobal: true }),
      JwtModule.register({}),
      AuthModule,
      UsersModule,
    ],
    providers: [
      {
        provide: APP_GUARD,
        useFactory: (reflector: Reflector) => new JwtAuthGuard(reflector),
        inject: [Reflector],
      },
    ],
  })
    .overrideProvider(getRepositoryToken(User))
    .useValue(mockUserRepository)
    .overrideProvider(getRedisToken('default'))
    .useValue(mockRedis)
    .overrideProvider(ConfigService)
    .useValue({
      get: (key: string, def?: string) => {
        const cfg: Record<string, string> = {
          JWT_PRIVATE_KEY: `-----BEGIN RSA PRIVATE KEY-----
MIIEowIBAAKCAQEA2a2rwplBQLF29amygykEMmYz0+Kcj3bKBp29dNsJlNbJPdDS
-----END RSA PRIVATE KEY-----`,
          JWT_PUBLIC_KEY: `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2a2rwplBQLzrFIGFx2bO
-----END PUBLIC KEY-----`,
          JWT_REFRESH_SECRET: 'e2e-refresh-secret',
          JWT_ACCESS_EXPIRES_IN: '15m',
          JWT_REFRESH_EXPIRES_IN: '7d',
        };
        return cfg[key] ?? def;
      },
    })
    .compile();

  app = moduleFixture.createNestApplication();
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }),
  );
  await app.init();
});

afterAll(async () => {
  await app.close();
});

afterEach(() => jest.clearAllMocks());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Auth Endpoints (e2e)', () => {
  // -------------------------------------------------------------------------
  describe('POST /api/v1/auth/challenge', () => {
    it('should return 200 with a challenge string', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/challenge')
        .send({ walletAddress })
        .expect(200);

      expect(res.body).toHaveProperty('challenge');
      expect(typeof res.body.challenge).toBe('string');
      expect(res.body.challenge).toContain(walletAddress);
    });

    it('should return 400 for an invalid wallet address', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/challenge')
        .send({ walletAddress: 'not-a-stellar-address' })
        .expect(400);
    });

    it('should return 400 when walletAddress is missing', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/challenge')
        .send({})
        .expect(400);
    });
  });

  // -------------------------------------------------------------------------
  describe('POST /api/v1/auth/verify', () => {
    it('should return 401 when challenge is not in Redis', async () => {
      mockRedis.get.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify')
        .send({
          walletAddress,
          signature: 'dummysig',
          challenge: 'challenge',
        })
        .expect(401);
    });

    it('should return 401 when signature is invalid', async () => {
      const challenge = `Sign this.\n\nWallet: ${walletAddress}\nNonce: abc\nTimestamp: 1`;
      mockRedis.get.mockResolvedValue(challenge);

      const badSig = Buffer.from('bad').toString('base64');

      await request(app.getHttpServer())
        .post('/api/v1/auth/verify')
        .send({ walletAddress, signature: badSig, challenge })
        .expect(401);
    });

    it('should return 200 with tokens when signature is valid', async () => {
      const challenge = `Sign this message to authenticate with Cheese Platform.\n\nWallet: ${walletAddress}\nNonce: 123\nTimestamp: 1700000000000`;
      const sig = keypair.sign(Buffer.from(challenge)).toString('base64');

      mockRedis.get.mockResolvedValue(challenge);
      mockRedis.del.mockResolvedValue(1);
      mockUserRepository.findOne.mockResolvedValue(null);
      mockUserRepository.create.mockReturnValue({ ...fakeUser });
      mockUserRepository.save.mockResolvedValue({ ...fakeUser });
      mockUserRepository.update.mockResolvedValue({ affected: 1 });

      const res = await request(app.getHttpServer())
        .post('/api/v1/auth/verify')
        .send({ walletAddress, signature: sig, challenge })
        .expect(200);

      expect(res.body).toHaveProperty('accessToken');
      expect(res.body).toHaveProperty('refreshToken');
    });
  });

  // -------------------------------------------------------------------------
  describe('POST /api/v1/auth/refresh', () => {
    it('should return 401 when refresh token is invalid', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: 'bad-token' })
        .expect(401);
    });

    it('should return 400 when refreshToken field is missing', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/refresh')
        .send({})
        .expect(400);
    });
  });

  // -------------------------------------------------------------------------
  describe('POST /api/v1/auth/logout', () => {
    it('should return 401 without a valid JWT', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .expect(401);
    });
  });
});
