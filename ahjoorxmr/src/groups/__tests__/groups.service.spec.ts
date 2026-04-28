import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  InternalServerErrorException,
} from '@nestjs/common';
import { GroupsService } from '../groups.service';
import { Group } from '../entities/group.entity';
import { GroupStatus } from '../entities/group-status.enum';
import { Membership } from '../../memberships/entities/membership.entity';
import { MembershipStatus } from '../../memberships/entities/membership-status.enum';
import { WinstonLogger } from '../../common/logger/winston.logger';
import { CreateGroupDto } from '../dto/create-group.dto';
import { UpdateGroupDto } from '../dto/update-group.dto';
import { NotificationsService } from '../../notification/notifications.service';
import { StellarService } from '../../stellar/stellar.service';
import { AuditService } from '../../audit/audit.service';
import { TransferAdminDto } from '../dto/transfer-admin.dto';
import { ConfigService } from '@nestjs/config';
import { GroupTemplatesService } from '../group-templates.service';

// ---------------------------------------------------------------------------
// Mock factories
// ---------------------------------------------------------------------------

const BASE_GROUP_ID = '123e4567-e89b-12d3-a456-426614174001';
const BASE_USER_ID = '123e4567-e89b-12d3-a456-426614174002';
const ADMIN_WALLET = 'GADMIN1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ';

/**
 * Factory for creating mock Group entities with sensible defaults.
 */
const createMockGroup = (overrides: Partial<Group> = {}): Group => ({
  id: BASE_GROUP_ID,
  name: 'Test ROSCA Group',
  contractAddress: null,
  adminWallet: ADMIN_WALLET,
  contributionAmount: '100',
  token: 'USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
  roundDuration: 2592000,
  status: GroupStatus.PENDING,
  currentRound: 0,
  totalRounds: 10,
  minMembers: 3,
  maxMembers: 10,
  staleAt: null,
  memberships: [],
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  ...overrides,
});

/**
 * Factory for creating mock Membership entities with sensible defaults.
 */
const createMockMembership = (
  overrides: Partial<Membership> = {},
): Membership => ({
  id: '123e4567-e89b-12d3-a456-426614174099',
  groupId: BASE_GROUP_ID,
  userId: BASE_USER_ID,
  walletAddress: 'GMEMBER1234567890ABCDEFGHIJKLMNOPQRSTUVWXYZ',
  payoutOrder: 0,
  hasReceivedPayout: false,
  hasPaidCurrentRound: false,
  status: MembershipStatus.ACTIVE,
  group: createMockGroup(),
  user: null,
  createdAt: new Date('2024-01-01T00:00:00Z'),
  updatedAt: new Date('2024-01-01T00:00:00Z'),
  ...overrides,
});

// ---------------------------------------------------------------------------
// Repository + Logger mock types
// ---------------------------------------------------------------------------

type MockRepository<T = any> = Partial<Record<keyof Repository<T>, jest.Mock>>;

const createMockRepository = <T = any>(): MockRepository<T> => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  find: jest.fn(),
  findAndCount: jest.fn(),
});

type MockLogger = Partial<Record<keyof WinstonLogger, jest.Mock>>;

const createMockLogger = (): MockLogger => ({
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  verbose: jest.fn(),
});

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('GroupsService', () => {
  let service: GroupsService;
  let groupRepository: MockRepository<Group>;
  let membershipRepository: MockRepository<Membership>;
  let logger: MockLogger;
  let notificationsService: Partial<NotificationsService>;
  let stellarService: Partial<StellarService>;
  let auditService: Partial<AuditService>;
  let mockDataSource: Partial<DataSource>;
  let groupTemplatesService: Partial<GroupTemplatesService>;

   beforeEach(async () => {
     groupRepository = createMockRepository<Group>();
     membershipRepository = createMockRepository<Membership>();
     logger = createMockLogger();
     notificationsService = {
       notify: jest.fn().mockResolvedValue({}),
       notifyBatch: jest.fn().mockResolvedValue([]),
     };
     stellarService = {
       deployRoscaContract: jest.fn().mockResolvedValue('CFAKEADDRESS123'),
       disbursePayout: jest.fn().mockResolvedValue('TX_HASH_MOCK'),
     };
     auditService = {
       createLog: jest.fn().mockResolvedValue({}),
     };
     groupTemplatesService = {
       findTemplateById: jest.fn(),
       mergeTemplateConfig: jest.fn().mockImplementation((template, dto) => dto),
       incrementUsageCount: jest.fn(),
     };

    // Default DataSource mock: transaction callback runs immediately
    const mockEntityManager = {
      getRepository: jest.fn().mockImplementation(() => ({
        findOne: jest.fn().mockImplementation(({ where }) => {
          // Return the group that was set up in each test via groupRepository.findOne
          return groupRepository.findOne!({ where } as any);
        }),
        save: jest.fn().mockImplementation((entity) => Promise.resolve(entity)),
      })),
    };
    mockDataSource = {
      transaction: jest.fn().mockImplementation((cb) => cb(mockEntityManager)),
    } as any;

     const module: TestingModule = await Test.createTestingModule({
       providers: [
         GroupsService,
         {
           provide: getRepositoryToken(Group),
           useValue: groupRepository,
         },
         {
           provide: getRepositoryToken(Membership),
           useValue: membershipRepository,
         },
         {
           provide: WinstonLogger,
           useValue: logger,
         },
         {
           provide: NotificationsService,
           useValue: notificationsService,
         },
         {
           provide: StellarService,
           useValue: stellarService,
         },
         {
           provide: AuditService,
           useValue: auditService,
         },
         {
           provide: DataSource,
           useValue: mockDataSource,
         },
         {
           provide: ConfigService,
           useValue: {
             get: jest.fn(),
           },
         },
         {
           provide: GroupTemplatesService,
           useValue: groupTemplatesService,
         },
       ],
     }).compile();

    service = module.get<GroupsService>(GroupsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Service Initialization
  // -------------------------------------------------------------------------

  describe('Service Initialization', () => {
    it('should be defined', () => {
      expect(service).toBeDefined();
    });

    it('should have groupRepository injected', () => {
      expect(groupRepository).toBeDefined();
    });

    it('should have membershipRepository injected', () => {
      expect(membershipRepository).toBeDefined();
    });

    it('should have logger injected', () => {
      expect(logger).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // createGroup
  // -------------------------------------------------------------------------

  describe('createGroup', () => {
    const dto: CreateGroupDto = {
      name: 'My ROSCA',
      adminWallet: ADMIN_WALLET,
      contributionAmount: '50',
      token: 'USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5',
      roundDuration: 2592000,
      totalRounds: 12,
      minMembers: 3,
    };

    it('should create and return a PENDING group', async () => {
      const mockGroup = createMockGroup({
        name: dto.name,
        contributionAmount: dto.contributionAmount,
        totalRounds: dto.totalRounds,
        maxMembers: dto.totalRounds,
      });

      groupRepository.create!.mockReturnValue(mockGroup);
      groupRepository.save!.mockResolvedValue(mockGroup);

      const result = await service.createGroup(dto, ADMIN_WALLET);

      expect(groupRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          status: GroupStatus.PENDING,
          currentRound: 0,
          adminWallet: ADMIN_WALLET,
          contractAddress: null,
          maxMembers: dto.totalRounds,
        }),
      );
      expect(groupRepository.save).toHaveBeenCalledWith(mockGroup);
      expect(result.status).toBe(GroupStatus.PENDING);
      expect(result.currentRound).toBe(0);
    });

    it('should set contractAddress to null when not provided', async () => {
      const mockGroup = createMockGroup({ contractAddress: null });
      groupRepository.create!.mockReturnValue(mockGroup);
      groupRepository.save!.mockResolvedValue(mockGroup);

      await service.createGroup(dto, ADMIN_WALLET);

      expect(groupRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ contractAddress: null }),
      );
    });

    it('should set contractAddress when provided in dto', async () => {
      const contractAddress = 'CCONTRACT1234567890';
      const dtoWithContract = { ...dto, contractAddress };
      const mockGroup = createMockGroup({ contractAddress });
      groupRepository.create!.mockReturnValue(mockGroup);
      groupRepository.save!.mockResolvedValue(mockGroup);

      await service.createGroup(dtoWithContract, ADMIN_WALLET);

      expect(groupRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ contractAddress }),
      );
    });

    it('should log the creation', async () => {
      const mockGroup = createMockGroup();
      groupRepository.create!.mockReturnValue(mockGroup);
      groupRepository.save!.mockResolvedValue(mockGroup);

      await service.createGroup(dto, ADMIN_WALLET);

      expect(logger.log).toHaveBeenCalledTimes(2);
    });

    it('should throw BadRequestException when maxMembers != totalRounds', async () => {
      const invalidDto = { ...dto, totalRounds: 12, maxMembers: 10 };

      await expect(
        service.createGroup(invalidDto, ADMIN_WALLET),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createGroup(invalidDto, ADMIN_WALLET),
      ).rejects.toThrow('maxMembers must equal totalRounds');
    });

    it('should throw BadRequestException when minMembers > maxMembers', async () => {
      const invalidDto = { ...dto, totalRounds: 5, minMembers: 8 };

      await expect(
        service.createGroup(invalidDto, ADMIN_WALLET),
      ).rejects.toThrow(BadRequestException);
      await expect(
        service.createGroup(invalidDto, ADMIN_WALLET),
      ).rejects.toThrow('minMembers must be less than or equal to maxMembers');
    });

    it('should default maxMembers to totalRounds when not provided', async () => {
      const mockGroup = createMockGroup({ totalRounds: 12, maxMembers: 12 });
      groupRepository.create!.mockReturnValue(mockGroup);
      groupRepository.save!.mockResolvedValue(mockGroup);

      await service.createGroup(dto, ADMIN_WALLET);

      expect(groupRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({ maxMembers: dto.totalRounds }),
      );
    });

    it('should propagate unexpected errors', async () => {
      groupRepository.create!.mockReturnValue({});
      groupRepository.save!.mockRejectedValue(new Error('DB failure'));

      await expect(service.createGroup(dto, ADMIN_WALLET)).rejects.toThrow(
        'DB failure',
      );
      expect(logger.error).toHaveBeenCalled();
    });

    it('should apply template configuration and increment usage count when templateId is provided', async () => {
      const templateId = 'temp-uuid';
      const mockTemplate = {
        id: templateId,
        config: {
          contributionAmount: '200.00',
          roundDuration: 2592000,
          totalRounds: 12,
          maxMembers: 12,
          minMembers: 3,
          assetCode: 'USDC',
          assetIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
          payoutOrderStrategy: 'SEQUENTIAL',
          penaltyRate: 0.05,
          gracePeriodHours: 24,
          timezone: 'UTC',
        },
        isPublic: false,
        ownerId: BASE_USER_ID,
      } as any;

      (groupTemplatesService.findTemplateById as jest.Mock).mockResolvedValue(mockTemplate);
      (groupTemplatesService.mergeTemplateConfig as jest.Mock).mockReturnValue({
        ...dto,
        assetCode: 'USDC',
        assetIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
        payoutOrderStrategy: 'SEQUENTIAL',
        penaltyRate: 0.05,
        gracePeriodHours: 24,
        timezone: 'UTC',
      });

      const mockSavedGroup = createMockGroup();
      groupRepository.create!.mockReturnValue(mockSavedGroup);
      groupRepository.save!.mockResolvedValue(mockSavedGroup);

      await service.createGroup(
        { ...dto, templateId } as any,
        ADMIN_WALLET,
        BASE_USER_ID,
      );

      expect(groupTemplatesService.findTemplateById).toHaveBeenCalledWith(templateId, BASE_USER_ID);
      expect(groupTemplatesService.mergeTemplateConfig).toHaveBeenCalledWith(mockTemplate, expect.objectContaining({ templateId }));
      expect(groupTemplatesService.incrementUsageCount).toHaveBeenCalledWith(templateId);
    });
  });

  // -------------------------------------------------------------------------
  // findAll
  // -------------------------------------------------------------------------

  describe('findAll', () => {
    it('should return a paginated result with default page and limit', async () => {
      const mockGroups = [
        createMockGroup(),
        createMockGroup({ id: 'other-id' }),
      ];
      groupRepository.findAndCount!.mockResolvedValue([mockGroups, 2]);

      const result = await service.findAll(1, 10);

      expect(groupRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 0, take: 10 }),
      );
      expect(result.data).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });

    it('should calculate correct skip for page 2', async () => {
      groupRepository.findAndCount!.mockResolvedValue([[], 0]);

      await service.findAll(2, 5);

      expect(groupRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ skip: 5, take: 5 }),
      );
    });

    it('should return empty data when no groups exist', async () => {
      groupRepository.findAndCount!.mockResolvedValue([[], 0]);

      const result = await service.findAll();

      expect(result.data).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('should order by createdAt DESC', async () => {
      groupRepository.findAndCount!.mockResolvedValue([[], 0]);

      await service.findAll();

      expect(groupRepository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({ order: { createdAt: 'DESC' } }),
      );
    });

    it('should propagate errors', async () => {
      groupRepository.findAndCount!.mockRejectedValue(new Error('DB error'));

      await expect(service.findAll()).rejects.toThrow('DB error');
      expect(logger.error).toHaveBeenCalled();
    });

    it('should filter stale groups when filter=stale', async () => {
      const staleGroup = createMockGroup({
        id: 'stale-1',
        staleAt: new Date('2024-01-15'),
      });
      groupRepository.findAndCount!.mockResolvedValue([[staleGroup], 1]);

      const result = await service.findAll(1, 10, false, 'stale');

      expect(result.data).toHaveLength(1);
      expect(result.data[0].staleAt).toBeTruthy();
    });

    it('should not filter when no filter is provided', async () => {
      const groups = [
        createMockGroup({ id: 'group-1', staleAt: null }),
        createMockGroup({ id: 'group-2', staleAt: new Date() }),
      ];
      groupRepository.findAndCount!.mockResolvedValue([groups, 2]);

      const result = await service.findAll(1, 10, false);

      expect(result.data).toHaveLength(2);
    });
  });

  // -------------------------------------------------------------------------
  // findOne
  // -------------------------------------------------------------------------

  describe('findOne', () => {
    it('should return the group with memberships included', async () => {
      const mockGroup = createMockGroup({
        memberships: [createMockMembership()],
      });
      groupRepository.findOne!.mockResolvedValue(mockGroup);

      const result = await service.findOne(BASE_GROUP_ID);

      expect(groupRepository.findOne).toHaveBeenCalledWith({
        where: { id: BASE_GROUP_ID },
        relations: ['memberships'],
      });
      expect(result.id).toBe(BASE_GROUP_ID);
      expect(result.memberships).toHaveLength(1);
    });

    it('should throw NotFoundException when group does not exist', async () => {
      groupRepository.findOne!.mockResolvedValue(null);

      await expect(service.findOne('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should propagate unexpected errors', async () => {
      groupRepository.findOne!.mockRejectedValue(new Error('DB error'));

      await expect(service.findOne(BASE_GROUP_ID)).rejects.toThrow('DB error');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // update
  // -------------------------------------------------------------------------

  describe('update', () => {
    const updateDto: UpdateGroupDto = { name: 'Updated Name' };

    it('should update and return the group when PENDING', async () => {
      const mockGroup = createMockGroup({ status: GroupStatus.PENDING });
      const updatedGroup = { ...mockGroup, name: 'Updated Name' } as Group;
      groupRepository.findOne!.mockResolvedValue(mockGroup);
      groupRepository.save!.mockResolvedValue(updatedGroup);

      const result = await service.update(
        BASE_GROUP_ID,
        updateDto,
        ADMIN_WALLET,
      );

      expect(groupRepository.save).toHaveBeenCalled();
      expect(result.name).toBe('Updated Name');
    });

    it('should throw NotFoundException when group does not exist', async () => {
      groupRepository.findOne!.mockResolvedValue(null);

      await expect(
        service.update('non-existent-id', updateDto, ADMIN_WALLET),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException when requester is not the admin', async () => {
      const mockGroup = createMockGroup({ adminWallet: ADMIN_WALLET });
      groupRepository.findOne!.mockResolvedValue(mockGroup);

      await expect(
        service.update(BASE_GROUP_ID, updateDto, 'GDIFFERENT_WALLET'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when group is ACTIVE', async () => {
      const mockGroup = createMockGroup({ status: GroupStatus.ACTIVE });
      groupRepository.findOne!.mockResolvedValue(mockGroup);

      await expect(
        service.update(BASE_GROUP_ID, updateDto, ADMIN_WALLET),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException when group is COMPLETED', async () => {
      const mockGroup = createMockGroup({ status: GroupStatus.COMPLETED });
      groupRepository.findOne!.mockResolvedValue(mockGroup);

      await expect(
        service.update(BASE_GROUP_ID, updateDto, ADMIN_WALLET),
      ).rejects.toThrow(BadRequestException);
    });

    it('should propagate unexpected errors', async () => {
      groupRepository.findOne!.mockRejectedValue(new Error('DB error'));

      await expect(
        service.update(BASE_GROUP_ID, updateDto, ADMIN_WALLET),
      ).rejects.toThrow('DB error');
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // findMyGroups
  // -------------------------------------------------------------------------

  describe('findMyGroups', () => {
    it('should return groups for which user has memberships', async () => {
      const mockGroup = createMockGroup();
      const mockMembership = createMockMembership({ group: mockGroup });
      membershipRepository.find!.mockResolvedValue([mockMembership]);

      const result = await service.findMyGroups(BASE_USER_ID);

      expect(membershipRepository.find).toHaveBeenCalledWith({
        where: { userId: BASE_USER_ID },
        relations: ['group'],
      });
      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(BASE_GROUP_ID);
    });

    it('should return an empty array when user has no memberships', async () => {
      membershipRepository.find!.mockResolvedValue([]);

      const result = await service.findMyGroups(BASE_USER_ID);

      expect(result).toHaveLength(0);
    });

    it('should filter out memberships with null groups', async () => {
      const membership = createMockMembership({ group: null });
      membershipRepository.find!.mockResolvedValue([membership]);

      const result = await service.findMyGroups(BASE_USER_ID);

      expect(result).toHaveLength(0);
    });

    it('should log the operation', async () => {
      membershipRepository.find!.mockResolvedValue([]);

      await service.findMyGroups(BASE_USER_ID);

      expect(logger.log).toHaveBeenCalledTimes(2);
    });

    it('should propagate errors', async () => {
      membershipRepository.find!.mockRejectedValue(new Error('DB error'));

      await expect(service.findMyGroups(BASE_USER_ID)).rejects.toThrow(
        'DB error',
      );
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // activateGroup
  // -------------------------------------------------------------------------

  describe('activateGroup', () => {
    const groupId = BASE_GROUP_ID;
    const adminWallet = ADMIN_WALLET;

    it('should activate a PENDING group with enough members (happy path)', async () => {
      const mockGroup = createMockGroup({
        status: GroupStatus.PENDING,
        currentRound: 0,
        minMembers: 3,
        memberships: [
          createMockMembership({ id: 'member-1' }),
          createMockMembership({ id: 'member-2' }),
          createMockMembership({ id: 'member-3' }),
        ],
      });

      const activatedGroup = {
        ...mockGroup,
        status: GroupStatus.ACTIVE,
        currentRound: 1,
      } as Group;

      groupRepository.findOne!.mockResolvedValue(mockGroup);
      groupRepository.save!.mockResolvedValue(activatedGroup);

      const result = await service.activateGroup(groupId, adminWallet);

      expect(groupRepository.findOne).toHaveBeenCalledWith({
        where: { id: groupId },
        relations: ['memberships'],
      });
      expect(groupRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          status: GroupStatus.ACTIVE,
          currentRound: 1,
        }),
      );
      expect(stellarService.deployRoscaContract).toHaveBeenCalledWith(
        expect.objectContaining({ id: groupId }),
      );
      expect(result.contractAddress).toBe('CFAKEADDRESS123');
      expect(result.status).toBe(GroupStatus.ACTIVE);
      expect(result.currentRound).toBe(1);
      expect(logger.log).toHaveBeenCalled();
    });

    it('should rollback to PENDING if contract deployment fails', async () => {
      const mockGroup = createMockGroup({
        status: GroupStatus.PENDING,
        currentRound: 0,
        minMembers: 2,
        memberships: [
          createMockMembership({ id: 'member-1' }),
          createMockMembership({ id: 'member-2' }),
        ],
      });
      const activatedGroup = {
        ...mockGroup,
        status: GroupStatus.ACTIVE,
        currentRound: 1,
      } as Group;
      groupRepository.findOne!.mockResolvedValue(mockGroup);
      groupRepository
        .save!.mockResolvedValueOnce(activatedGroup)
        .mockResolvedValueOnce({ ...mockGroup } as Group);
      (stellarService.deployRoscaContract as jest.Mock).mockRejectedValue(
        new Error('deploy failed'),
      );

      await expect(service.activateGroup(groupId, adminWallet)).rejects.toThrow(
        BadRequestException,
      );
      expect(groupRepository.save).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          status: GroupStatus.PENDING,
          currentRound: 0,
        }),
      );
    });

    it('should throw NotFoundException when group does not exist', async () => {
      groupRepository.findOne!.mockResolvedValue(null);

      await expect(
        service.activateGroup('non-existent-id', adminWallet),
      ).rejects.toThrow(NotFoundException);
      await expect(
        service.activateGroup('non-existent-id', adminWallet),
      ).rejects.toThrow('Group not found');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should throw ForbiddenException when caller is not the admin', async () => {
      const mockGroup = createMockGroup({
        adminWallet: ADMIN_WALLET,
        status: GroupStatus.PENDING,
        minMembers: 2,
        memberships: [
          createMockMembership({ id: 'member-1' }),
          createMockMembership({ id: 'member-2' }),
        ],
      });
      groupRepository.findOne!.mockResolvedValue(mockGroup);

      const differentWallet = 'GDIFFERENT_WALLET_ADDRESS';

      await expect(
        service.activateGroup(groupId, differentWallet),
      ).rejects.toThrow(ForbiddenException);
      await expect(
        service.activateGroup(groupId, differentWallet),
      ).rejects.toThrow('Only the group admin can activate this group');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should throw BadRequestException when group status is not PENDING', async () => {
      const mockGroup = createMockGroup({
        status: GroupStatus.ACTIVE,
        minMembers: 2,
        memberships: [
          createMockMembership({ id: 'member-1' }),
          createMockMembership({ id: 'member-2' }),
        ],
      });
      groupRepository.findOne!.mockResolvedValue(mockGroup);

      await expect(service.activateGroup(groupId, adminWallet)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.activateGroup(groupId, adminWallet)).rejects.toThrow(
        'Group is not in a pending state',
      );
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should throw BadRequestException when group is COMPLETED', async () => {
      const mockGroup = createMockGroup({
        status: GroupStatus.COMPLETED,
        minMembers: 2,
        memberships: [
          createMockMembership({ id: 'member-1' }),
          createMockMembership({ id: 'member-2' }),
        ],
      });
      groupRepository.findOne!.mockResolvedValue(mockGroup);

      await expect(service.activateGroup(groupId, adminWallet)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.activateGroup(groupId, adminWallet)).rejects.toThrow(
        'Group is not in a pending state',
      );
    });

    it('should throw BadRequestException when group does not have enough members', async () => {
      const mockGroup = createMockGroup({
        status: GroupStatus.PENDING,
        minMembers: 5,
        memberships: [
          createMockMembership({ id: 'member-1' }),
          createMockMembership({ id: 'member-2' }),
        ],
      });
      groupRepository.findOne!.mockResolvedValue(mockGroup);

      await expect(service.activateGroup(groupId, adminWallet)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.activateGroup(groupId, adminWallet)).rejects.toThrow(
        'Group does not have enough members',
      );
      expect(logger.warn).toHaveBeenCalled();
    });

    it('should throw BadRequestException when group has zero members', async () => {
      const mockGroup = createMockGroup({
        status: GroupStatus.PENDING,
        minMembers: 1,
        memberships: [],
      });
      groupRepository.findOne!.mockResolvedValue(mockGroup);

      await expect(service.activateGroup(groupId, adminWallet)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.activateGroup(groupId, adminWallet)).rejects.toThrow(
        'Group does not have enough members',
      );
    });

    it('should handle group with exactly minMembers count', async () => {
      const mockGroup = createMockGroup({
        status: GroupStatus.PENDING,
        currentRound: 0,
        minMembers: 2,
        memberships: [
          createMockMembership({ id: 'member-1' }),
          createMockMembership({ id: 'member-2' }),
        ],
      });

      const activatedGroup = {
        ...mockGroup,
        status: GroupStatus.ACTIVE,
        currentRound: 1,
      } as Group;

      groupRepository.findOne!.mockResolvedValue(mockGroup);
      groupRepository.save!.mockResolvedValue(activatedGroup);

      const result = await service.activateGroup(groupId, adminWallet);

      expect(result.status).toBe(GroupStatus.ACTIVE);
      expect(result.currentRound).toBe(1);
    });

    it('should propagate unexpected errors', async () => {
      groupRepository.findOne!.mockRejectedValue(new Error('DB error'));

      await expect(service.activateGroup(groupId, adminWallet)).rejects.toThrow(
        'DB error',
      );
      expect(logger.error).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // advanceRound
  // -------------------------------------------------------------------------

  describe('advanceRound', () => {
    const groupId = BASE_GROUP_ID;
    const adminWallet = ADMIN_WALLET;

    /** Helper: build a DataSource mock whose transaction() runs the callback
     *  with an EntityManager that delegates to the outer mock repositories. */
    const buildDataSourceMock = (groupOverride?: Partial<Group>) => {
      const innerGroupRepo = {
        findOne: jest
          .fn()
          .mockImplementation(() => Promise.resolve(groupOverride ?? null)),
        save: jest.fn().mockImplementation((g) => Promise.resolve(g)),
      };
      const innerMembershipRepo = {
        save: jest.fn().mockImplementation((m) => Promise.resolve(m)),
      };
      const entityManager = {
        getRepository: jest.fn().mockImplementation((entity) => {
          if (entity === Group) return innerGroupRepo;
          return innerMembershipRepo;
        }),
      };
      const ds = {
        transaction: jest.fn().mockImplementation((cb) => cb(entityManager)),
        _innerGroupRepo: innerGroupRepo,
        _innerMembershipRepo: innerMembershipRepo,
      };
      return ds;
    };

    it('should call disbursePayout before advancing the round', async () => {
      const recipient = createMockMembership({
        id: 'member-1',
        userId: 'user-1',
        payoutOrder: 0, // round 1 → index 0
        hasPaidCurrentRound: true,
        walletAddress: 'GRECIPIENT',
      });
      const mockGroup = createMockGroup({
        status: GroupStatus.ACTIVE,
        currentRound: 1,
        totalRounds: 5,
        contractAddress: 'CCONTRACT123',
        contributionAmount: '100',
        memberships: [
          recipient,
          createMockMembership({
            id: 'member-2',
            userId: 'user-2',
            payoutOrder: 1,
            hasPaidCurrentRound: true,
          }),
        ],
      });

      const ds = buildDataSourceMock({
        ...mockGroup,
        memberships: mockGroup.memberships,
      });
      (mockDataSource as any).transaction = ds.transaction;

      groupRepository.findOne!.mockResolvedValue(mockGroup);
      ds._innerGroupRepo.findOne.mockResolvedValue({
        ...mockGroup,
        memberships: mockGroup.memberships,
      });

      await service.advanceRound(groupId, adminWallet);

      expect(stellarService.disbursePayout).toHaveBeenCalledWith(
        'CCONTRACT123',
        'GRECIPIENT',
        '100',
      );
    });

    it('should store txHash on recipient membership after payout', async () => {
      const recipient = createMockMembership({
        id: 'member-1',
        userId: 'user-1',
        payoutOrder: 0,
        hasPaidCurrentRound: true,
        walletAddress: 'GRECIPIENT',
        transactionHash: null,
      });
      const mockGroup = createMockGroup({
        status: GroupStatus.ACTIVE,
        currentRound: 1,
        totalRounds: 5,
        contractAddress: 'CCONTRACT123',
        contributionAmount: '100',
        memberships: [recipient],
      });

      (stellarService.disbursePayout as jest.Mock).mockResolvedValue(
        'TX_HASH_ABC',
      );

      const ds = buildDataSourceMock({
        ...mockGroup,
        memberships: [{ ...recipient }],
      });
      (mockDataSource as any).transaction = ds.transaction;
      groupRepository.findOne!.mockResolvedValue(mockGroup);

      await service.advanceRound(groupId, adminWallet);

      expect(ds._innerMembershipRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ transactionHash: 'TX_HASH_ABC' }),
      );
    });

    it('should NOT advance round if disbursePayout throws', async () => {
      const recipient = createMockMembership({
        id: 'member-1',
        payoutOrder: 0,
        hasPaidCurrentRound: true,
        walletAddress: 'GRECIPIENT',
      });
      const mockGroup = createMockGroup({
        status: GroupStatus.ACTIVE,
        currentRound: 1,
        totalRounds: 5,
        contractAddress: 'CCONTRACT123',
        contributionAmount: '100',
        memberships: [recipient],
      });

      (stellarService.disbursePayout as jest.Mock).mockRejectedValue(
        new Error('Stellar RPC timeout'),
      );
      groupRepository.findOne!.mockResolvedValue(mockGroup);

      await expect(service.advanceRound(groupId, adminWallet)).rejects.toThrow(
        InternalServerErrorException,
      );
      await expect(service.advanceRound(groupId, adminWallet)).rejects.toThrow(
        'On-chain payout failed; round not advanced',
      );
      // DB transaction should never have been called
      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });

    it('should advance to next round when all members have paid', async () => {
      const member1 = createMockMembership({
        id: 'member-1',
        userId: 'user-1',
        payoutOrder: 0,
        hasPaidCurrentRound: true,
      });
      const member2 = createMockMembership({
        id: 'member-2',
        userId: 'user-2',
        payoutOrder: 1,
        hasPaidCurrentRound: true,
      });
      const mockGroup = createMockGroup({
        status: GroupStatus.ACTIVE,
        currentRound: 1,
        totalRounds: 5,
        contractAddress: 'CCONTRACT123',
        memberships: [member1, member2],
      });

      const advancedGroup = { ...mockGroup, currentRound: 2 } as Group;
      groupRepository.findOne!.mockResolvedValue(mockGroup);

      const ds = buildDataSourceMock({
        ...mockGroup,
        memberships: [member1, member2],
      });
      ds._innerGroupRepo.save.mockResolvedValue(advancedGroup);
      (mockDataSource as any).transaction = ds.transaction;

      const result = await service.advanceRound(groupId, adminWallet);

      expect(result.currentRound).toBe(2);
      expect(result.status).toBe(GroupStatus.ACTIVE);
    });

    it('should mark group as COMPLETED when advancing past totalRounds', async () => {
      const member = createMockMembership({
        id: 'member-1',
        payoutOrder: 4,
        hasPaidCurrentRound: true,
      });
      const mockGroup = createMockGroup({
        status: GroupStatus.ACTIVE,
        currentRound: 5,
        totalRounds: 5,
        contractAddress: 'CCONTRACT123',
        memberships: [member],
      });

      const completedGroup = {
        ...mockGroup,
        currentRound: 6,
        status: GroupStatus.COMPLETED,
      } as Group;
      groupRepository.findOne!.mockResolvedValue(mockGroup);

      const ds = buildDataSourceMock({ ...mockGroup, memberships: [member] });
      ds._innerGroupRepo.save.mockResolvedValue(completedGroup);
      (mockDataSource as any).transaction = ds.transaction;

      const result = await service.advanceRound(groupId, adminWallet);

      expect(result.currentRound).toBe(6);
      expect(result.status).toBe(GroupStatus.COMPLETED);
    });

    it('should throw NotFoundException when group does not exist', async () => {
      groupRepository.findOne!.mockResolvedValue(null);

      await expect(service.advanceRound(groupId, adminWallet)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException when caller is not the admin', async () => {
      const mockGroup = createMockGroup({
        status: GroupStatus.ACTIVE,
        adminWallet: ADMIN_WALLET,
      });
      groupRepository.findOne!.mockResolvedValue(mockGroup);

      await expect(
        service.advanceRound(groupId, 'GDIFFERENT_WALLET'),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException when group is not ACTIVE', async () => {
      const mockGroup = createMockGroup({
        status: GroupStatus.PENDING,
      });
      groupRepository.findOne!.mockResolvedValue(mockGroup);

      await expect(service.advanceRound(groupId, adminWallet)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException when not all members have paid', async () => {
      const mockGroup = createMockGroup({
        status: GroupStatus.ACTIVE,
        currentRound: 1,
        memberships: [
          createMockMembership({ hasPaidCurrentRound: true }),
          createMockMembership({ hasPaidCurrentRound: false }),
        ],
      });
      groupRepository.findOne!.mockResolvedValue(mockGroup);

      await expect(service.advanceRound(groupId, adminWallet)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.advanceRound(groupId, adminWallet)).rejects.toThrow(
        'All members must pay before advancing',
      );
    });

    it('should reset hasPaidCurrentRound for all members inside the transaction', async () => {
      const member1 = createMockMembership({
        id: 'member-1',
        userId: 'user-1',
        payoutOrder: 0,
        hasPaidCurrentRound: true,
      });
      const member2 = createMockMembership({
        id: 'member-2',
        userId: 'user-2',
        payoutOrder: 1,
        hasPaidCurrentRound: true,
      });
      const mockGroup = createMockGroup({
        status: GroupStatus.ACTIVE,
        currentRound: 1,
        totalRounds: 5,
        contractAddress: 'CCONTRACT123',
        memberships: [member1, member2],
      });

      groupRepository.findOne!.mockResolvedValue(mockGroup);
      const ds = buildDataSourceMock({
        ...mockGroup,
        memberships: [{ ...member1 }, { ...member2 }],
      });
      (mockDataSource as any).transaction = ds.transaction;

      await service.advanceRound(groupId, adminWallet);

      expect(ds._innerMembershipRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ hasPaidCurrentRound: false }),
      );
    });

    it('should send ROUND_OPENED notifications after advancing', async () => {
      const member1 = createMockMembership({
        id: 'member-1',
        userId: 'user-1',
        payoutOrder: 0,
        hasPaidCurrentRound: true,
      });
      const member2 = createMockMembership({
        id: 'member-2',
        userId: 'user-2',
        payoutOrder: 1,
        hasPaidCurrentRound: true,
      });
      const mockGroup = createMockGroup({
        name: 'Test Group',
        status: GroupStatus.ACTIVE,
        currentRound: 1,
        totalRounds: 5,
        contractAddress: 'CCONTRACT123',
        memberships: [member1, member2],
      });

      groupRepository.findOne!.mockResolvedValue(mockGroup);
      const ds = buildDataSourceMock({
        ...mockGroup,
        memberships: [{ ...member1 }, { ...member2 }],
      });
      ds._innerGroupRepo.save.mockResolvedValue({
        ...mockGroup,
        currentRound: 2,
      });
      (mockDataSource as any).transaction = ds.transaction;

      await service.advanceRound(groupId, adminWallet);

      expect(notificationsService.notifyBatch).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({ userId: 'user-1', type: 'round_opened' }),
          expect.objectContaining({ userId: 'user-2', type: 'round_opened' }),
        ]),
      );
    });

    it('should clear staleAt flag when advancing round', async () => {
      const member = createMockMembership({
        id: 'member-1',
        payoutOrder: 0,
        hasPaidCurrentRound: true,
      });
      const mockGroup = createMockGroup({
        status: GroupStatus.ACTIVE,
        currentRound: 1,
        totalRounds: 5,
        staleAt: new Date('2024-01-15'),
        contractAddress: 'CCONTRACT123',
        memberships: [member],
      });

      groupRepository.findOne!.mockResolvedValue(mockGroup);
      const innerGroup = { ...mockGroup, memberships: [{ ...member }] };
      const ds = buildDataSourceMock(innerGroup);
      (mockDataSource as any).transaction = ds.transaction;

      await service.advanceRound(groupId, adminWallet);

      expect(ds._innerGroupRepo.save).toHaveBeenCalledWith(
        expect.objectContaining({ staleAt: null }),
      );
      expect(logger.log).toHaveBeenCalledWith(
        expect.stringContaining('Cleared stale flag'),
        'GroupsService',
      );
    });

    it('should skip disbursePayout when group has no contractAddress', async () => {
      const member = createMockMembership({
        id: 'member-1',
        payoutOrder: 0,
        hasPaidCurrentRound: true,
      });
      const mockGroup = createMockGroup({
        status: GroupStatus.ACTIVE,
        currentRound: 1,
        totalRounds: 5,
        contractAddress: null,
        memberships: [member],
      });

      groupRepository.findOne!.mockResolvedValue(mockGroup);
      const ds = buildDataSourceMock({
        ...mockGroup,
        memberships: [{ ...member }],
      });
      (mockDataSource as any).transaction = ds.transaction;

      await service.advanceRound(groupId, adminWallet);

      expect(stellarService.disbursePayout).not.toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // getContractState
  // -------------------------------------------------------------------------

  describe('getContractState', () => {
    const groupId = BASE_GROUP_ID;

    it('should fetch contract state for a group with contractAddress', async () => {
      const mockGroup = createMockGroup({
        contractAddress:
          'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
      });
      const mockState = {
        status: 'ACTIVE',
        currentRound: 3,
        totalMembers: 5,
      };

      groupRepository.findOne!.mockResolvedValue(mockGroup);
      (stellarService.getGroupState as jest.Mock).mockResolvedValue(mockState);

      const result = await service.getContractState(groupId);

      expect(groupRepository.findOne).toHaveBeenCalledWith({
        where: { id: groupId },
      });
      expect(stellarService.getGroupState).toHaveBeenCalledWith(
        'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
      );
      expect(result).toEqual(mockState);
      expect(logger.log).toHaveBeenCalledWith(
        `Fetching contract state for group ${groupId}`,
        'GroupsService',
      );
      expect(logger.log).toHaveBeenCalledWith(
        `Successfully fetched contract state for group ${groupId}`,
        'GroupsService',
      );
    });

    it('should throw NotFoundException when group does not exist', async () => {
      groupRepository.findOne!.mockResolvedValue(null);

      await expect(service.getContractState('non-existent-id')).rejects.toThrow(
        NotFoundException,
      );
      await expect(service.getContractState('non-existent-id')).rejects.toThrow(
        'Group not found',
      );
      expect(stellarService.getGroupState).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when group has no contractAddress', async () => {
      const mockGroup = createMockGroup({
        contractAddress: null,
      });

      groupRepository.findOne!.mockResolvedValue(mockGroup);

      await expect(service.getContractState(groupId)).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.getContractState(groupId)).rejects.toThrow(
        'Group has no contract address',
      );
      expect(stellarService.getGroupState).not.toHaveBeenCalled();
    });

    it('should throw BadRequestException when contractAddress is empty string', async () => {
      const mockGroup = createMockGroup({
        contractAddress: '',
      });

      groupRepository.findOne!.mockResolvedValue(mockGroup);

      await expect(service.getContractState(groupId)).rejects.toThrow(
        BadRequestException,
      );
      expect(stellarService.getGroupState).not.toHaveBeenCalled();
    });

    it('should handle stellar service errors and log them', async () => {
      const mockGroup = createMockGroup({
        contractAddress:
          'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
      });
      const stellarError = new Error('RPC connection failed');

      groupRepository.findOne!.mockResolvedValue(mockGroup);
      (stellarService.getGroupState as jest.Mock).mockRejectedValue(
        stellarError,
      );

      await expect(service.getContractState(groupId)).rejects.toThrow(
        'RPC connection failed',
      );
      expect(logger.error).toHaveBeenCalledWith(
        `Failed to fetch contract state for group ${groupId}: RPC connection failed`,
        expect.any(String),
        'GroupsService',
      );
    });

    it('should work with different contract addresses', async () => {
      const group1 = createMockGroup({
        id: 'group-1',
        contractAddress:
          'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
      });
      const group2 = createMockGroup({
        id: 'group-2',
        contractAddress:
          'CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBSC4',
      });
      const state1 = { status: 'ACTIVE', currentRound: 1 };
      const state2 = { status: 'ACTIVE', currentRound: 5 };

      groupRepository.findOne!.mockResolvedValueOnce(group1);
      groupRepository.findOne!.mockResolvedValueOnce(group2);
      (stellarService.getGroupState as jest.Mock)
        .mockResolvedValueOnce(state1)
        .mockResolvedValueOnce(state2);

      const result1 = await service.getContractState('group-1');
      const result2 = await service.getContractState('group-2');

      expect(result1).toEqual(state1);
      expect(result2).toEqual(state2);
      expect(stellarService.getGroupState).toHaveBeenCalledWith(
        'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4',
      );
      expect(stellarService.getGroupState).toHaveBeenCalledWith(
        'CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBSC4',
      );
    });
  });

  // -------------------------------------------------------------------------
  // transferAdmin
  // -------------------------------------------------------------------------

  describe('transferAdmin', () => {
    const groupId = 'group-123';
    const currentAdminWallet = 'GADMIN';
    const newAdminUserId = 'user-456';
    const newAdminWallet = 'GNEWADMIN';

    it('should transfer admin ownership successfully', async () => {
      const mockGroup = createMockGroup({
        id: groupId,
        adminWallet: currentAdminWallet,
        name: 'Test Group',
      });
      const mockMembership = createMockMembership({
        groupId,
        userId: newAdminUserId,
        walletAddress: newAdminWallet,
        status: MembershipStatus.ACTIVE,
      });

      groupRepository.findOne!.mockResolvedValue(mockGroup);
      membershipRepository.findOne!.mockResolvedValue(mockMembership);
      groupRepository.save!.mockResolvedValue({
        ...mockGroup,
        adminWallet: newAdminWallet,
      });

      const transferDto: TransferAdminDto = { newAdminUserId };
      const result = await service.transferAdmin(
        groupId,
        currentAdminWallet,
        transferDto,
      );

      expect(result.adminWallet).toBe(newAdminWallet);
      expect(groupRepository.save).toHaveBeenCalled();
      expect(auditService.createLog).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'GROUP_ADMIN_TRANSFER',
          resource: 'Group',
        }),
      );
      expect(notificationsService.notifyBatch).toHaveBeenCalled();
    });

    it('should throw NotFoundException if group does not exist', async () => {
      groupRepository.findOne!.mockResolvedValue(null);

      await expect(
        service.transferAdmin(groupId, currentAdminWallet, { newAdminUserId }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if requester is not the admin', async () => {
      const mockGroup = createMockGroup({
        id: groupId,
        adminWallet: 'OTHER_ADMIN',
      });
      groupRepository.findOne!.mockResolvedValue(mockGroup);

      await expect(
        service.transferAdmin(groupId, currentAdminWallet, { newAdminUserId }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw BadRequestException if target user is not an active member', async () => {
      const mockGroup = createMockGroup({
        id: groupId,
        adminWallet: currentAdminWallet,
      });
      groupRepository.findOne!.mockResolvedValue(mockGroup);
      membershipRepository.findOne!.mockResolvedValue(null);

      await expect(
        service.transferAdmin(groupId, currentAdminWallet, { newAdminUserId }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
