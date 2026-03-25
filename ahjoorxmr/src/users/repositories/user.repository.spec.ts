import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UserRepository } from './user.repository';
import { User } from '../entities/user.entity';

describe('UserRepository', () => {
  let userRepository: UserRepository;
  let mockRepository: jest.Mocked<Repository<User>>;

  const mockUser: User = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    walletAddress: 'GABC123XYZ789',
    email: 'test@example.com',
    username: 'testuser',
    twoFactorSecret: null,
    twoFactorEnabled: false,
    firstName: 'Test',
    lastName: 'User',
    avatarUrl: null,
    bio: null,
    preferences: {},
    isActive: true,
    isVerified: false,
    isBanned: false,
    bannedAt: null,
    banReason: null,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    memberships: [],
    updateLastLogin: jest.fn(),
    ban: jest.fn(),
    unban: jest.fn(),
    verify: jest.fn(),
    fullName: 'Test User',
  } as any;

  beforeEach(async () => {
    mockRepository = {
      findOne: jest.fn(),
      find: jest.fn(),
      save: jest.fn(),
      update: jest.fn(),
      softDelete: jest.fn(),
      createQueryBuilder: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserRepository,
        {
          provide: getRepositoryToken(User),
          useValue: mockRepository,
        },
      ],
    }).compile();

    userRepository = module.get<UserRepository>(UserRepository);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('findByWalletAddress', () => {
    it('should find a user by wallet address', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await userRepository.findByWalletAddress('GABC123XYZ789');

      expect(result).toEqual(mockUser);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { walletAddress: 'GABC123XYZ789' },
      });
    });

    it('should return null if user not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await userRepository.findByWalletAddress('NONEXISTENT');

      expect(result).toBeNull();
    });
  });

  describe('findByEmail', () => {
    it('should find a user by email', async () => {
      mockRepository.findOne.mockResolvedValue(mockUser);

      const result = await userRepository.findByEmail('test@example.com');

      expect(result).toEqual(mockUser);
      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { email: 'test@example.com' },
      });
    });

    it('should return null if email not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      const result = await userRepository.findByEmail(
        'nonexistent@example.com',
      );

      expect(result).toBeNull();
    });
  });

  describe('searchUsers', () => {
    it('should search users by query', async () => {
      const mockQueryBuilder = {
        where: jest.fn().returnThis(),
        orWhere: jest.fn().returnThis(),
        take: jest.fn().returnThis(),
        getMany: jest.fn().resolvedValue([mockUser]),
      };

      mockRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      const result = await userRepository.searchUsers('test', 10);

      expect(result).toEqual([mockUser]);
      expect(mockRepository.createQueryBuilder).toHaveBeenCalledWith('user');
      expect(mockQueryBuilder.where).toHaveBeenCalled();
      expect(mockQueryBuilder.take).toHaveBeenCalledWith(10);
    });

    it('should use default limit if not provided', async () => {
      const mockQueryBuilder = {
        where: jest.fn().returnThis(),
        orWhere: jest.fn().returnThis(),
        take: jest.fn().returnThis(),
        getMany: jest.fn().resolvedValue([mockUser]),
      };

      mockRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      await userRepository.searchUsers('test');

      expect(mockQueryBuilder.take).toHaveBeenCalledWith(50);
    });
  });

  describe('updateLastLogin', () => {
    it('should update last login timestamp', async () => {
      mockRepository.update.mockResolvedValue({ affected: 1 } as any);

      await userRepository.updateLastLogin('user-id');

      expect(mockRepository.update).toHaveBeenCalledWith('user-id', {
        lastLoginAt: expect.any(Date),
      });
    });
  });

  describe('banUser', () => {
    it('should ban a user with reason', async () => {
      const bannedUser = { ...mockUser, isBanned: true };
      mockRepository.findOne.mockResolvedValue(mockUser);
      mockRepository.save.mockResolvedValue(bannedUser);

      const result = await userRepository.banUser('user-id', 'Terms violation');

      expect(result.isBanned).toBe(true);
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          isBanned: true,
          bannedAt: expect.any(Date),
          banReason: 'Terms violation',
        }),
      );
    });

    it('should ban a user without reason', async () => {
      const bannedUser = { ...mockUser, isBanned: true };
      mockRepository.findOne.mockResolvedValue(mockUser);
      mockRepository.save.mockResolvedValue(bannedUser);

      const result = await userRepository.banUser('user-id');

      expect(result.isBanned).toBe(true);
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          isBanned: true,
          bannedAt: expect.any(Date),
        }),
      );
    });

    it('should throw error if user not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(userRepository.banUser('nonexistent-id')).rejects.toThrow(
        'User not found',
      );
    });
  });

  describe('verifyUser', () => {
    it('should verify a user', async () => {
      const verifiedUser = { ...mockUser, isVerified: true };
      mockRepository.findOne.mockResolvedValue(mockUser);
      mockRepository.save.mockResolvedValue(verifiedUser);

      const result = await userRepository.verifyUser('user-id');

      expect(result.isVerified).toBe(true);
      expect(mockRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          isVerified: true,
        }),
      );
    });

    it('should throw error if user not found', async () => {
      mockRepository.findOne.mockResolvedValue(null);

      await expect(userRepository.verifyUser('nonexistent-id')).rejects.toThrow(
        'User not found',
      );
    });
  });

  describe('findWithPagination', () => {
    it('should return paginated users', async () => {
      const users = [mockUser, { ...mockUser, id: 'user-2' }];
      mockRepository.find.mockResolvedValue(users);
      const mockCount = jest.fn().mockResolvedValue(2);
      (mockRepository as any).count = mockCount;

      const [result, total] = await userRepository.findWithPagination(1, 10);

      expect(result).toEqual(users);
      expect(total).toBe(2);
      expect(mockRepository.find).toHaveBeenCalledWith({
        skip: 0,
        take: 10,
        order: { createdAt: 'DESC' },
      });
    });

    it('should handle pagination correctly for page 2', async () => {
      mockRepository.find.mockResolvedValue([mockUser]);
      const mockCount = jest.fn().mockResolvedValue(25);
      (mockRepository as any).count = mockCount;

      await userRepository.findWithPagination(2, 10);

      expect(mockRepository.find).toHaveBeenCalledWith({
        skip: 10,
        take: 10,
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('softRemove', () => {
    it('should soft delete a user', async () => {
      mockRepository.softDelete.mockResolvedValue({ affected: 1 } as any);

      await userRepository.softRemove('user-id');

      expect(mockRepository.softDelete).toHaveBeenCalledWith('user-id');
    });
  });

  describe('getUserStats', () => {
    it('should return user statistics', async () => {
      const mockStats = {
        totalMemberships: 5,
        activeMemberships: 3,
        totalContributions: 10,
        totalContributionAmount: 1000,
      };

      const mockQueryBuilder = {
        leftJoin: jest.fn().returnThis(),
        select: jest.fn().returnThis(),
        where: jest.fn().returnThis(),
        getRawOne: jest.fn().resolvedValue(mockStats),
      };

      mockRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      const result = await userRepository.getUserStats('user-id');

      expect(result).toEqual(mockStats);
      expect(mockRepository.createQueryBuilder).toHaveBeenCalledWith('user');
    });

    it('should handle user with no memberships', async () => {
      const mockStats = {
        totalMemberships: 0,
        activeMemberships: 0,
        totalContributions: 0,
        totalContributionAmount: 0,
      };

      const mockQueryBuilder = {
        leftJoin: jest.fn().returnThis(),
        select: jest.fn().returnThis(),
        where: jest.fn().returnThis(),
        getRawOne: jest.fn().resolvedValue(mockStats),
      };

      mockRepository.createQueryBuilder.mockReturnValue(
        mockQueryBuilder as any,
      );

      const result = await userRepository.getUserStats('user-id');

      expect(result.totalMemberships).toBe(0);
      expect(result.activeMemberships).toBe(0);
    });
  });
});
