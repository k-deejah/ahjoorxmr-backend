import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { UsersService } from '../users/users.service';
import { TwoFactorService } from './two-factor.service';
import { StellarService } from '../stellar/stellar.service';
import { MailService } from '../mail/mail.service';

const mockUser = {
  id: 'user-uuid',
  walletAddress: 'GTEST',
  email: 'test@example.com',
  role: 'user',
  tokenVersion: 0,
};

const makeToken = (overrides: Partial<RefreshToken> = {}): RefreshToken => ({
  id: 'token-uuid',
  userId: 'user-uuid',
  tokenHash: 'hash',
  expiresAt: new Date(Date.now() + 7 * 86400000),
  absoluteExpiresAt: new Date(Date.now() + 30 * 86400000),
  revokedAt: null,
  deviceId: null,
  deviceName: null,
  ipAddress: null,
  createdAt: new Date(),
  lastUsedAt: new Date(),
  ...overrides,
});

describe('AuthService – refresh token rotation (issue #224)', () => {
  let service: AuthService;
  let tokenRepo: any;
  let mailService: any;
  let usersService: any;

  beforeEach(async () => {
    tokenRepo = {
      findOne: jest.fn(),
      find: jest.fn(),
      create: jest.fn((v) => v),
      save: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    };

    mailService = { sendMail: jest.fn().mockResolvedValue(undefined) };

    usersService = {
      findByWalletAddress: jest.fn().mockResolvedValue(mockUser),
      findById: jest.fn().mockResolvedValue(mockUser),
      findByEmail: jest.fn(),
      create: jest.fn(),
      incrementTokenVersion: jest.fn().mockResolvedValue(1),
      revokeAllSessions: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(RefreshToken), useValue: tokenRepo },
        {
          provide: JwtService,
          useValue: {
            verifyAsync: jest.fn().mockResolvedValue({ sub: 'GTEST', userId: 'user-uuid' }),
            signAsync: jest.fn().mockResolvedValue('new-token'),
          },
        },
        {
          provide: ConfigService,
          useValue: { get: jest.fn((k: string, d?: any) => d) },
        },
        { provide: UsersService, useValue: usersService },
        { provide: TwoFactorService, useValue: {} },
        { provide: StellarService, useValue: { verifySignature: jest.fn() } },
        { provide: MailService, useValue: mailService },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('rotates token: revokes old and issues new', async () => {
    const stored = makeToken();
    tokenRepo.findOne.mockResolvedValue(stored);
    tokenRepo.save.mockResolvedValue(stored);

    await service.refreshTokens('incoming-token');

    expect(stored.revokedAt).not.toBeNull();
    expect(tokenRepo.save).toHaveBeenCalledWith(expect.objectContaining({ revokedAt: expect.any(Date) }));
  });

  it('detects reuse: revokes all sessions and sends security alert', async () => {
    const stored = makeToken({ revokedAt: new Date(Date.now() - 1000) });
    tokenRepo.findOne.mockResolvedValue(stored);
    tokenRepo.update.mockResolvedValue({ affected: 1 });

    await expect(service.refreshTokens('reused-token')).rejects.toThrow(UnauthorizedException);
    expect(usersService.revokeAllSessions).toHaveBeenCalledWith('user-uuid');
    expect(mailService.sendMail).toHaveBeenCalled();
  });

  it('rejects token past absoluteExpiresAt', async () => {
    const stored = makeToken({ absoluteExpiresAt: new Date(Date.now() - 1000) });
    tokenRepo.findOne.mockResolvedValue(stored);
    tokenRepo.save.mockResolvedValue(stored);

    await expect(service.refreshTokens('expired-absolute')).rejects.toThrow(UnauthorizedException);
  });

  it('carries forward absoluteExpiresAt on rotation', async () => {
    const absoluteExpiry = new Date(Date.now() + 20 * 86400000);
    const stored = makeToken({ absoluteExpiresAt: absoluteExpiry });
    tokenRepo.findOne.mockResolvedValue(stored);
    tokenRepo.save.mockResolvedValue(stored);
    tokenRepo.create.mockImplementation((v: any) => v);

    await service.refreshTokens('valid-token');

    expect(tokenRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ absoluteExpiresAt: absoluteExpiry }),
    );
  });

  it('listSessions returns only active sessions', async () => {
    const active = makeToken({ id: 'active-1' });
    const expired = makeToken({ id: 'expired-1', expiresAt: new Date(Date.now() - 1000) });
    const revoked = makeToken({ id: 'revoked-1', revokedAt: new Date() });
    tokenRepo.find.mockResolvedValue([active, expired]);

    const sessions = await service.listSessions('user-uuid');
    expect(sessions).toHaveLength(1);
    expect(sessions[0].id).toBe('active-1');
  });
});
