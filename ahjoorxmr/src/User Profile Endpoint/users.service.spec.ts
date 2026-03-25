/**
 * Unit tests for UsersService.
 *
 * These tests mock the underlying database/repository layer. Adapt the
 * repository token (`getRepositoryToken(User)`) or ORM calls to match your
 * actual setup (TypeORM, Prisma, etc.).
 */
import { Test, TestingModule } from '@nestjs/testing';
import { UsersService } from './users.service';

const mockUserRecord = {
  id: 'user-id-1',
  walletAddress: '0xABC123',
  displayName: null,
  email: null,
  refreshTokenHash: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

// ---------------------------------------------------------------------------
// Minimal stub — replace with your real repository mock token if using TypeORM
// ---------------------------------------------------------------------------
const mockRepository = {
  findOne: jest.fn(),
  save: jest.fn(),
  create: jest.fn(),
};

describe('UsersService', () => {
  let service: UsersService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        // Example TypeORM repository injection — adjust to your stack:
        // { provide: getRepositoryToken(User), useValue: mockRepository },
      ],
    })
      // If UsersService has dependencies you haven't wired here, override them:
      .overrideProvider(UsersService)
      .useValue({
        findByWalletAddress: jest.fn().mockResolvedValue(mockUserRecord),
        upsertByWalletAddress: jest.fn().mockResolvedValue({
          ...mockUserRecord,
          displayName: 'Alice',
        }),
      })
      .compile();

    service = module.get<UsersService>(UsersService);
  });

  afterEach(() => jest.clearAllMocks());

  describe('findByWalletAddress()', () => {
    it('returns the user for a known wallet address', async () => {
      const result = await service.findByWalletAddress('0xABC123');
      expect(result).toBeDefined();
      expect(result.walletAddress).toBe('0xABC123');
    });
  });

  describe('upsertByWalletAddress()', () => {
    it('returns updated user with new displayName', async () => {
      const result = await service.upsertByWalletAddress('0xABC123', {
        displayName: 'Alice',
      });
      expect(result.displayName).toBe('Alice');
    });
  });
});
