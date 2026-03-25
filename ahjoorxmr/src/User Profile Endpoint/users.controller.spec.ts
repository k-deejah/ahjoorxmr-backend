import { Test, TestingModule } from '@nestjs/testing';
import { UserResponseDto } from './dto/user-response.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

const mockUser = {
  id: 'user-id-1',
  walletAddress: '0xABC123',
  displayName: 'Alice',
  email: 'alice@example.com',
  refreshTokenHash: 'super-secret-hash',
  createdAt: new Date('2024-01-01'),
  updatedAt: new Date('2024-01-02'),
};

const mockUsersService = {
  findByWalletAddress: jest.fn().mockResolvedValue(mockUser),
  upsertByWalletAddress: jest.fn().mockResolvedValue(mockUser),
};

describe('UsersController', () => {
  let controller: UsersController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [{ provide: UsersService, useValue: mockUsersService }],
    }).compile();

    controller = module.get<UsersController>(UsersController);
  });

  afterEach(() => jest.clearAllMocks());

  describe('getMe()', () => {
    it('returns a UserResponseDto with safe fields', async () => {
      const req = { user: { walletAddress: '0xABC123' } };
      const result = await controller.getMe(req);

      expect(result).toBeInstanceOf(UserResponseDto);
      expect(result.id).toBe(mockUser.id);
      expect(result.walletAddress).toBe(mockUser.walletAddress);
      expect(result.displayName).toBe(mockUser.displayName);
      expect(result.email).toBe(mockUser.email);
    });

    it('does NOT expose refreshTokenHash', async () => {
      const req = { user: { walletAddress: '0xABC123' } };
      const result = await controller.getMe(req);

      expect((result as any).refreshTokenHash).toBeUndefined();
    });

    it('calls findByWalletAddress with the correct address', async () => {
      const req = { user: { walletAddress: '0xABC123' } };
      await controller.getMe(req);

      expect(mockUsersService.findByWalletAddress).toHaveBeenCalledWith(
        '0xABC123',
      );
    });
  });

  describe('updateMe()', () => {
    it('calls upsertByWalletAddress and returns a UserResponseDto', async () => {
      const req = { user: { walletAddress: '0xABC123' } };
      const dto: UpdateUserDto = {
        displayName: 'Bob',
        email: 'bob@example.com',
      };

      const result = await controller.updateMe(req, dto);

      expect(mockUsersService.upsertByWalletAddress).toHaveBeenCalledWith(
        '0xABC123',
        dto,
      );
      expect(result).toBeInstanceOf(UserResponseDto);
    });

    it('does NOT expose refreshTokenHash after update', async () => {
      const req = { user: { walletAddress: '0xABC123' } };
      const dto: UpdateUserDto = { displayName: 'Bob' };

      const result = await controller.updateMe(req, dto);
      expect((result as any).refreshTokenHash).toBeUndefined();
    });
  });
});
