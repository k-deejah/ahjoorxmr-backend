import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { MembershipsService } from '../memberships.service';
import { Membership } from '../entities/membership.entity';
import { Group } from '../../groups/entities/group.entity';
import { WinstonLogger } from '../../common/logger/winston.logger';
import { MembershipStatus } from '../entities/membership-status.enum';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { NotificationsService } from '../../notification/notifications.service';
import { GroupStatus } from '../../groups/entities/group-status.enum';

/**
 * Mock factory for creating Membership entities with default values.
 * Allows partial overrides for specific test scenarios.
 */
const createMockMembership = (overrides?: Partial<Membership>): Membership => {
  const defaultMembership: Membership = {
    id: '123e4567-e89b-12d3-a456-426614174000',
    groupId: '123e4567-e89b-12d3-a456-426614174001',
    userId: '123e4567-e89b-12d3-a456-426614174002',
    walletAddress: '0x1234567890abcdef',
    payoutOrder: 0,
    hasReceivedPayout: false,
    hasPaidCurrentRound: false,
    transactionHash: null,
    status: MembershipStatus.ACTIVE,
    createdAt: new Date('2024-01-01T00:00:00Z'),
    updatedAt: new Date('2024-01-01T00:00:00Z'),
    group: null,
    user: null,
  };

  return { ...defaultMembership, ...overrides };
};

/**
 * Mock factory for creating Group entities with default values.
 * Allows partial overrides for specific test scenarios.
 */
const createMockGroup = (overrides?: Partial<Group>): Group => {
  const defaultGroup: Group = {
    id: '123e4567-e89b-12d3-a456-426614174001',
    name: 'Test Group',
    contributionAmount: '100',
    status: GroupStatus.PENDING,
  };

  return { ...defaultGroup, ...overrides } as Group;
};

/**
 * Type definition for mocked TypeORM repository.
 * Includes all commonly used repository methods.
 */
type MockRepository<T = any> = Partial<Record<keyof Repository<T>, jest.Mock>>;

/**
 * Creates a mock repository with Jest mock functions for all methods.
 */
const createMockRepository = <T = any>(): MockRepository<T> => ({
  find: jest.fn(),
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  remove: jest.fn(),
  createQueryBuilder: jest.fn(),
});

/**
 * Type definition for mocked WinstonLogger.
 */
type MockLogger = Partial<Record<keyof WinstonLogger, jest.Mock>>;

/**
 * Creates a mock logger with Jest mock functions for all methods.
 */
const createMockLogger = (): MockLogger => ({
  log: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
});

describe('MembershipsService', () => {
  let service: MembershipsService;
  let membershipRepository: MockRepository<Membership>;
  let groupRepository: MockRepository<Group>;
  let logger: MockLogger;
  let notificationsService: Partial<NotificationsService>;

  beforeEach(async () => {
    // Create mock instances
    membershipRepository = createMockRepository<Membership>();
    groupRepository = createMockRepository<Group>();
    logger = createMockLogger();
    notificationsService = {
      notify: jest.fn().mockResolvedValue({}),
    };

    // Create testing module with mocked dependencies
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MembershipsService,
        {
          provide: getRepositoryToken(Membership),
          useValue: membershipRepository,
        },
        {
          provide: getRepositoryToken(Group),
          useValue: groupRepository,
        },
        {
          provide: WinstonLogger,
          useValue: logger,
        },
        {
          provide: NotificationsService,
          useValue: notificationsService,
        },
      ],
    }).compile();

    service = module.get<MembershipsService>(MembershipsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Service Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have membershipRepository injected', () => {
      expect(membershipRepository).toBeDefined();
    });

    it('should have groupRepository injected', () => {
      expect(groupRepository).toBeDefined();
    });

    it('should have logger injected', () => {
      expect(logger).toBeDefined();
    });
  });

  describe('Mock Factories', () => {
    it('should create a mock membership with default values', () => {
      const membership = createMockMembership();

      expect(membership.id).toBeDefined();
      expect(membership.groupId).toBeDefined();
      expect(membership.userId).toBeDefined();
      expect(membership.walletAddress).toBeDefined();
      expect(membership.payoutOrder).toBe(0);
      expect(membership.hasReceivedPayout).toBe(false);
      expect(membership.hasPaidCurrentRound).toBe(false);
      expect(membership.status).toBe(MembershipStatus.ACTIVE);
      expect(membership.createdAt).toBeInstanceOf(Date);
      expect(membership.updatedAt).toBeInstanceOf(Date);
    });

    it('should create a mock membership with overrides', () => {
      const membership = createMockMembership({
        payoutOrder: 5,
        status: MembershipStatus.SUSPENDED,
        hasReceivedPayout: true,
      });

      expect(membership.payoutOrder).toBe(5);
      expect(membership.status).toBe(MembershipStatus.SUSPENDED);
      expect(membership.hasReceivedPayout).toBe(true);
      expect(membership.hasPaidCurrentRound).toBe(false); // Default value preserved
    });

    it('should create a mock group with default values', () => {
      const group = createMockGroup();

      expect(group.id).toBeDefined();
      expect(group.status).toBe('PENDING');
    });

    it('should create a mock group with overrides', () => {
      const group = createMockGroup({ status: 'ACTIVE' });

      expect(group.status).toBe(GroupStatus.ACTIVE);
    });
  });

  describe('recordPayout', () => {
    const groupId = '123e4567-e89b-12d3-a456-426614174001';
    const userId = '123e4567-e89b-12d3-a456-426614174002';
    const txHash = '0xabcdef1234567890';

    it('should record payout successfully', async () => {
      const group = createMockGroup({ status: GroupStatus.ACTIVE });
      const membership = createMockMembership({ hasReceivedPayout: false });
      const updatedMembership = {
        ...membership,
        hasReceivedPayout: true,
        transactionHash: txHash,
      };

      groupRepository.findOne!.mockResolvedValue(group);
      membershipRepository.findOne!.mockResolvedValue(membership);
      membershipRepository.save!.mockResolvedValue(updatedMembership);

      const result = await service.recordPayout(groupId, userId, txHash);

      expect(result.hasReceivedPayout).toBe(true);
      expect(result.transactionHash).toBe(txHash);
      expect(notificationsService.notify).toHaveBeenCalledWith(
        expect.objectContaining({
          userId,
          type: 'payout_received',
          title: 'Payout Received',
        }),
      );
    });

    it('should throw NotFoundException when group does not exist', async () => {
      groupRepository.findOne!.mockResolvedValue(null);

      await expect(
        service.recordPayout(groupId, userId, txHash),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when group is not ACTIVE', async () => {
      const group = createMockGroup({ status: GroupStatus.PENDING });
      groupRepository.findOne!.mockResolvedValue(group);

      await expect(
        service.recordPayout(groupId, userId, txHash),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw NotFoundException when membership does not exist', async () => {
      const group = createMockGroup({ status: GroupStatus.ACTIVE });
      groupRepository.findOne!.mockResolvedValue(group);
      membershipRepository.findOne!.mockResolvedValue(null);

      await expect(
        service.recordPayout(groupId, userId, txHash),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ConflictException when member already received payout', async () => {
      const group = createMockGroup({ status: GroupStatus.ACTIVE });
      const membership = createMockMembership({ hasReceivedPayout: true });

      groupRepository.findOne!.mockResolvedValue(group);
      membershipRepository.findOne!.mockResolvedValue(membership);

      await expect(
        service.recordPayout(groupId, userId, txHash),
      ).rejects.toThrow(ConflictException);
      await expect(
        service.recordPayout(groupId, userId, txHash),
      ).rejects.toThrow('Member has already received payout');
    });
  });

  // Placeholder for addMember tests
  describe('addMember', () => {
    it('should be defined', () => {
      expect(service.addMember).toBeDefined();
    });
  });

  // Placeholder for removeMember tests
  describe('removeMember', () => {
    it('should be defined', () => {
      expect(service.removeMember).toBeDefined();
    });
  });

  // Placeholder for listMembers tests
  describe('listMembers', () => {
    it('should be defined', () => {
      expect(service.listMembers).toBeDefined();
    });
  });
});
