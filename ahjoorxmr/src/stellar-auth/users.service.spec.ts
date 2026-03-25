import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import { User } from '../users/entities/user.entity';

type MockRepository<T = any> = Partial<Record<keyof Repository<T>, jest.Mock>>;

function createMockRepository<T>(): MockRepository<T> {
  return {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };
}

const WALLET = 'GBVZM3OSDLSNP5LJJQAYZMJQJIQXQP5PGLLQZXEYQZRTDMZQNM3NLFB';

describe('UsersService', () => {
  let service: UsersService;
  let repo: MockRepository<User>;

  beforeEach(async () => {
    repo = createMockRepository<User>();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        { provide: getRepositoryToken(User), useValue: repo },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => jest.clearAllMocks());

  // -------------------------------------------------------------------------
  describe('upsertByWalletAddress()', () => {
    it('should return existing user without creating a new one', async () => {
      const existing = { id: '1', walletAddress: WALLET };
      repo.findOne!.mockResolvedValue(existing);

      const user = await service.upsertByWalletAddress(WALLET);

      expect(repo.findOne).toHaveBeenCalledWith({
        where: { walletAddress: WALLET },
      });
      expect(repo.create).not.toHaveBeenCalled();
      expect(user).toBe(existing);
    });

    it('should create and save a new user when wallet is not found', async () => {
      const newUser = { id: '2', walletAddress: WALLET };
      repo.findOne!.mockResolvedValue(null);
      repo.create!.mockReturnValue(newUser);
      repo.save!.mockResolvedValue(newUser);

      const user = await service.upsertByWalletAddress(WALLET);

      expect(repo.create).toHaveBeenCalledWith({ walletAddress: WALLET });
      expect(repo.save).toHaveBeenCalledWith(newUser);
      expect(user).toBe(newUser);
    });
  });

  // -------------------------------------------------------------------------
  describe('findByWalletAddress()', () => {
    it('should return user when found', async () => {
      const user = { id: '1', walletAddress: WALLET };
      repo.findOne!.mockResolvedValue(user);

      const result = await service.findByWalletAddress(WALLET);

      expect(result).toBe(user);
    });

    it('should return null when user is not found', async () => {
      repo.findOne!.mockResolvedValue(null);

      const result = await service.findByWalletAddress(WALLET);

      expect(result).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  describe('updateRefreshTokenHash()', () => {
    it('should call repository update with the correct arguments', async () => {
      repo.update!.mockResolvedValue({ affected: 1 });

      await service.updateRefreshTokenHash('user-id', 'sha256hash');

      expect(repo.update).toHaveBeenCalledWith('user-id', {
        refreshTokenHash: 'sha256hash',
      });
    });

    it('should accept null to clear the refresh token hash', async () => {
      repo.update!.mockResolvedValue({ affected: 1 });

      await service.updateRefreshTokenHash('user-id', null);

      expect(repo.update).toHaveBeenCalledWith('user-id', {
        refreshTokenHash: null,
      });
    });
  });
});
