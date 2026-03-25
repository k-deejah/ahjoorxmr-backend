import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';

const mockAuthService = {
  generateChallenge: jest.fn(),
  verifySignature: jest.fn(),
  refreshAccessToken: jest.fn(),
  logout: jest.fn(),
};

const WALLET_ADDRESS =
  'GBVZM3OSDLSNP5LJJQAYZMJQJIQXQP5PGLLQZXEYQZRTDMZQNM3NLFB';

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  describe('POST /challenge', () => {
    it('should return a challenge string', async () => {
      mockAuthService.generateChallenge.mockResolvedValue('challenge-string');

      const result = await controller.challenge({
        walletAddress: WALLET_ADDRESS,
      });

      expect(mockAuthService.generateChallenge).toHaveBeenCalledWith(
        WALLET_ADDRESS,
      );
      expect(result).toEqual({ challenge: 'challenge-string' });
    });
  });

  describe('POST /verify', () => {
    it('should return access and refresh tokens', async () => {
      const tokens = { accessToken: 'at', refreshToken: 'rt' };
      mockAuthService.verifySignature.mockResolvedValue(tokens);

      const result = await controller.verify({
        walletAddress: WALLET_ADDRESS,
        signature: 'sig',
        challenge: 'challenge',
      });

      expect(mockAuthService.verifySignature).toHaveBeenCalledWith(
        WALLET_ADDRESS,
        'sig',
        'challenge',
      );
      expect(result).toEqual(tokens);
    });
  });

  describe('POST /refresh', () => {
    it('should return a new access token', async () => {
      mockAuthService.refreshAccessToken.mockResolvedValue({
        accessToken: 'new-at',
      });

      const result = await controller.refresh({ refreshToken: 'rt' });

      expect(mockAuthService.refreshAccessToken).toHaveBeenCalledWith('rt');
      expect(result).toEqual({ accessToken: 'new-at' });
    });
  });

  describe('POST /logout', () => {
    it('should call logout with the authenticated user wallet address', async () => {
      mockAuthService.logout.mockResolvedValue(undefined);

      await controller.logout({ user: { walletAddress: WALLET_ADDRESS } });

      expect(mockAuthService.logout).toHaveBeenCalledWith(WALLET_ADDRESS);
    });
  });
});
