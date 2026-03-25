import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { getRedisToken } from '@nestjs-modules/ioredis';
import * as crypto from 'crypto';
import * as StellarSdk from '@stellar/stellar-sdk';
import { AuthService } from './auth.service';
import { UsersService } from '../users/users.service';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const WALLET_ADDRESS =
  'GBVZM3OSDLSNP5LJJQAYZMJQJIQXQP5PGLLQZXEYQZRTDMZQNM3NLFB';

function makeMockUser(overrides: Partial<any> = {}) {
  return {
    id: 'user-uuid-1',
    walletAddress: WALLET_ADDRESS,
    refreshTokenHash: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const mockRedis = {
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
};

const mockUsersService = {
  upsertByWalletAddress: jest.fn(),
  findByWalletAddress: jest.fn(),
  updateRefreshTokenHash: jest.fn(),
};

const mockJwtService = {
  signAsync: jest.fn(),
  verifyAsync: jest.fn(),
};

const mockConfigService = {
  get: jest.fn((key: string, defaultVal?: string) => {
    const config: Record<string, string> = {
      JWT_PRIVATE_KEY: 'mock-private-key',
      JWT_PUBLIC_KEY: 'mock-public-key',
      JWT_REFRESH_SECRET: 'mock-refresh-secret',
      JWT_ACCESS_EXPIRES_IN: '15m',
      JWT_REFRESH_EXPIRES_IN: '7d',
    };
    return config[key] ?? defaultVal;
  }),
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: UsersService, useValue: mockUsersService },
        { provide: JwtService, useValue: mockJwtService },
        { provide: ConfigService, useValue: mockConfigService },
        { provide: getRedisToken('default'), useValue: mockRedis },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // -------------------------------------------------------------------------
  // generateChallenge
  // -------------------------------------------------------------------------
  describe('generateChallenge()', () => {
    it('should create a challenge string containing the wallet address and nonce', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const challenge = await service.generateChallenge(WALLET_ADDRESS);

      expect(challenge).toContain(WALLET_ADDRESS);
      expect(challenge).toContain('Nonce:');
      expect(challenge).toContain('Timestamp:');
    });

    it('should store the challenge in Redis with a 5-minute TTL', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const challenge = await service.generateChallenge(WALLET_ADDRESS);

      expect(mockRedis.set).toHaveBeenCalledWith(
        `siws:challenge:${WALLET_ADDRESS}`,
        challenge,
        'EX',
        300,
      );
    });

    it('should generate a unique challenge on each call', async () => {
      mockRedis.set.mockResolvedValue('OK');

      const c1 = await service.generateChallenge(WALLET_ADDRESS);
      const c2 = await service.generateChallenge(WALLET_ADDRESS);

      expect(c1).not.toBe(c2);
    });
  });

  // -------------------------------------------------------------------------
  // verifySignature
  // -------------------------------------------------------------------------
  describe('verifySignature()', () => {
    const challenge = `Sign this message to authenticate with Cheese Platform.\n\nWallet: ${WALLET_ADDRESS}\nNonce: abc123\nTimestamp: 1700000000000`;

    it('should throw UnauthorizedException when challenge is not found in Redis', async () => {
      mockRedis.get.mockResolvedValue(null);

      await expect(
        service.verifySignature(WALLET_ADDRESS, 'sig', challenge),
      ).rejects.toThrow(UnauthorizedException);

      await expect(
        service.verifySignature(WALLET_ADDRESS, 'sig', challenge),
      ).rejects.toThrow('Challenge expired or not found');
    });

    it('should throw UnauthorizedException when stored challenge does not match provided challenge', async () => {
      mockRedis.get.mockResolvedValue('different-challenge');

      await expect(
        service.verifySignature(WALLET_ADDRESS, 'sig', challenge),
      ).rejects.toThrow('Challenge mismatch');
    });

    it('should throw UnauthorizedException when Stellar signature is invalid', async () => {
      mockRedis.get.mockResolvedValue(challenge);

      // Provide a valid-looking but incorrect base64 signature
      const badSig = Buffer.from('invalid-signature').toString('base64');

      await expect(
        service.verifySignature(WALLET_ADDRESS, badSig, challenge),
      ).rejects.toThrow('Invalid signature');
    });

    it('should delete the challenge from Redis after validation (replay protection)', async () => {
      // Use a real Stellar keypair so signature verification passes
      const keypair = StellarSdk.Keypair.random();
      const walletAddress = keypair.publicKey();
      const testChallenge = `Sign this message.\n\nWallet: ${walletAddress}\nNonce: xyz\nTimestamp: 123`;
      const sig = keypair.sign(Buffer.from(testChallenge)).toString('base64');

      mockRedis.get.mockResolvedValue(testChallenge);
      mockRedis.del.mockResolvedValue(1);
      mockUsersService.upsertByWalletAddress.mockResolvedValue(
        makeMockUser({ walletAddress }),
      );
      mockJwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');
      mockUsersService.updateRefreshTokenHash.mockResolvedValue(undefined);

      await service.verifySignature(walletAddress, sig, testChallenge);

      expect(mockRedis.del).toHaveBeenCalledWith(
        `siws:challenge:${walletAddress}`,
      );
    });

    it('should upsert user and return access + refresh tokens on success', async () => {
      const keypair = StellarSdk.Keypair.random();
      const walletAddress = keypair.publicKey();
      const testChallenge = `Sign this message.\n\nWallet: ${walletAddress}\nNonce: xyz\nTimestamp: 123`;
      const sig = keypair.sign(Buffer.from(testChallenge)).toString('base64');
      const user = makeMockUser({ walletAddress });

      mockRedis.get.mockResolvedValue(testChallenge);
      mockRedis.del.mockResolvedValue(1);
      mockUsersService.upsertByWalletAddress.mockResolvedValue(user);
      mockJwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');
      mockUsersService.updateRefreshTokenHash.mockResolvedValue(undefined);

      const result = await service.verifySignature(
        walletAddress,
        sig,
        testChallenge,
      );

      expect(mockUsersService.upsertByWalletAddress).toHaveBeenCalledWith(
        walletAddress,
      );
      expect(result).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
      });
    });

    it('should store a SHA-256 hash of the refresh token (not plain text)', async () => {
      const keypair = StellarSdk.Keypair.random();
      const walletAddress = keypair.publicKey();
      const testChallenge = `Sign.\n\nWallet: ${walletAddress}\nNonce: abc\nTimestamp: 1`;
      const sig = keypair.sign(Buffer.from(testChallenge)).toString('base64');

      mockRedis.get.mockResolvedValue(testChallenge);
      mockRedis.del.mockResolvedValue(1);
      mockUsersService.upsertByWalletAddress.mockResolvedValue(
        makeMockUser({ walletAddress }),
      );
      mockJwtService.signAsync
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('plain-refresh-token');
      mockUsersService.updateRefreshTokenHash.mockResolvedValue(undefined);

      await service.verifySignature(walletAddress, sig, testChallenge);

      const expectedHash = crypto
        .createHash('sha256')
        .update('plain-refresh-token')
        .digest('hex');

      expect(mockUsersService.updateRefreshTokenHash).toHaveBeenCalledWith(
        'user-uuid-1',
        expectedHash,
      );
    });
  });

  // -------------------------------------------------------------------------
  // refreshAccessToken
  // -------------------------------------------------------------------------
  describe('refreshAccessToken()', () => {
    it('should throw UnauthorizedException when refresh token is invalid JWT', async () => {
      mockJwtService.verifyAsync.mockRejectedValue(new Error('jwt malformed'));

      await expect(service.refreshAccessToken('bad-token')).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it('should throw UnauthorizedException when user does not exist', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({
        sub: 'user-id',
        walletAddress: WALLET_ADDRESS,
      });
      mockUsersService.findByWalletAddress.mockResolvedValue(null);

      await expect(service.refreshAccessToken('valid-jwt')).rejects.toThrow(
        'Refresh token revoked',
      );
    });

    it('should throw UnauthorizedException when stored hash does not match token', async () => {
      mockJwtService.verifyAsync.mockResolvedValue({
        sub: 'user-id',
        walletAddress: WALLET_ADDRESS,
      });
      mockUsersService.findByWalletAddress.mockResolvedValue(
        makeMockUser({ refreshTokenHash: 'different-hash' }),
      );

      await expect(service.refreshAccessToken('valid-jwt')).rejects.toThrow(
        'Refresh token mismatch',
      );
    });

    it('should return a new access token when refresh token is valid', async () => {
      const refreshToken = 'my-refresh-token';
      const expectedHash = crypto
        .createHash('sha256')
        .update(refreshToken)
        .digest('hex');

      mockJwtService.verifyAsync.mockResolvedValue({
        sub: 'user-id',
        walletAddress: WALLET_ADDRESS,
      });
      mockUsersService.findByWalletAddress.mockResolvedValue(
        makeMockUser({ refreshTokenHash: expectedHash }),
      );
      mockJwtService.signAsync.mockResolvedValue('new-access-token');

      const result = await service.refreshAccessToken(refreshToken);

      expect(result).toEqual({ accessToken: 'new-access-token' });
    });
  });

  // -------------------------------------------------------------------------
  // logout
  // -------------------------------------------------------------------------
  describe('logout()', () => {
    it('should nullify the refresh token hash for the user', async () => {
      const user = makeMockUser();
      mockUsersService.findByWalletAddress.mockResolvedValue(user);
      mockUsersService.updateRefreshTokenHash.mockResolvedValue(undefined);

      await service.logout(WALLET_ADDRESS);

      expect(mockUsersService.updateRefreshTokenHash).toHaveBeenCalledWith(
        user.id,
        null,
      );
    });

    it('should do nothing gracefully when user is not found', async () => {
      mockUsersService.findByWalletAddress.mockResolvedValue(null);

      await expect(service.logout(WALLET_ADDRESS)).resolves.toBeUndefined();
      expect(mockUsersService.updateRefreshTokenHash).not.toHaveBeenCalled();
    });
  });
});
