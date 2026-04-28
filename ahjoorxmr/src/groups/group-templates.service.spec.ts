import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import {
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { GroupTemplatesService } from './group-templates.service';
import { GroupTemplate, GroupTemplateConfig } from './entities/group-template.entity';
import { Group } from './entities/group.entity';
import { WinstonLogger } from '../common/logger/winston.logger';
import { CreateGroupTemplateDto } from './dto/group-template.dto';
import { GroupStatus } from './entities/group-status.enum';
import { PayoutOrderStrategy } from './entities/payout-order-strategy.enum';

describe('GroupTemplatesService', () => {
  let service: GroupTemplatesService;
  let templateRepository: Repository<GroupTemplate>;
  let groupRepository: Repository<Group>;
  let logger: WinstonLogger;
  let dataSource: DataSource;

  const mockUserId = '550e8400-e29b-41d4-a716-446655440000';
  const mockOwnerId = '550e8400-e29b-41d4-a716-446655440001';
  const mockGroupId = '550e8400-e29b-41d4-a716-446655440002';
  const mockTemplateId = '550e8400-e29b-41d4-a716-446655440003';

  const mockConfig: GroupTemplateConfig = {
    contributionAmount: '100.00',
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
  };

  const mockTemplate: GroupTemplate = {
    id: mockTemplateId,
    name: 'Test Template',
    description: 'A test template',
    isPublic: false,
    config: mockConfig,
    ownerId: mockOwnerId,
    usageCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    owner: null,
  };

  const mockGroup: Group = {
    id: mockGroupId,
    name: 'Test Group',
    contractAddress: null,
    adminWallet: 'GBXGQJWVLWOYHFLVTKWV5FGHA3LNYY2JQKM7OAJAUEQFU6LPCSEFVXON',
    contributionAmount: '100.00',
    token: 'USDC:GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    assetCode: 'USDC',
    assetIssuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    roundDuration: 2592000,
    status: GroupStatus.PENDING,
    currentRound: 0,
    totalRounds: 12,
    payoutOrderStrategy: PayoutOrderStrategy.SEQUENTIAL,
    minMembers: 3,
    maxMembers: 12,
    staleAt: null,
    startDate: null,
    endDate: null,
    timezone: 'UTC',
    penaltyRate: 0.05,
    gracePeriodHours: 24,
    deletedAt: null,
    memberships: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GroupTemplatesService,
        {
          provide: getRepositoryToken(GroupTemplate),
          useClass: Repository,
        },
        {
          provide: getRepositoryToken(Group),
          useClass: Repository,
        },
        {
          provide: WinstonLogger,
          useValue: { log: jest.fn(), error: jest.fn(), warn: jest.fn() },
        },
        {
          provide: DataSource,
          useValue: {},
        },
      ],
    }).compile();

    service = module.get<GroupTemplatesService>(GroupTemplatesService);
    templateRepository = module.get<Repository<GroupTemplate>>(
      getRepositoryToken(GroupTemplate),
    );
    groupRepository = module.get<Repository<Group>>(getRepositoryToken(Group));
    logger = module.get<WinstonLogger>(WinstonLogger);
    dataSource = module.get<DataSource>(DataSource);
  });

  describe('createTemplate', () => {
    it('should create a template from scratch', async () => {
      const createDto: CreateGroupTemplateDto = {
        name: 'Test Template',
        description: 'A test template',
        isPublic: false,
        config: mockConfig as any,
      };

      jest.spyOn(templateRepository, 'create').mockReturnValue(mockTemplate);
      jest.spyOn(templateRepository, 'save').mockResolvedValue(mockTemplate);

      const result = await service.createTemplate(createDto, mockUserId);

      expect(result).toEqual(mockTemplate);
      expect(templateRepository.create).toHaveBeenCalledWith({
        name: createDto.name,
        description: createDto.description,
        isPublic: createDto.isPublic,
        config: mockConfig,
        ownerId: mockUserId,
        usageCount: 0,
      });
      expect(templateRepository.save).toHaveBeenCalledWith(mockTemplate);
    });

    it('should create a template cloned from an existing group', async () => {
      const createDto: CreateGroupTemplateDto = {
        name: 'Cloned Template',
        description: 'Cloned from group',
        isPublic: false,
        fromGroupId: mockGroupId,
      };

      jest.spyOn(groupRepository, 'findOne').mockResolvedValue(mockGroup);
      jest.spyOn(templateRepository, 'create').mockReturnValue(mockTemplate);
      jest.spyOn(templateRepository, 'save').mockResolvedValue(mockTemplate);

      const result = await service.createTemplate(createDto, mockUserId);

      expect(groupRepository.findOne).toHaveBeenCalledWith({
        where: { id: mockGroupId },
      });
      expect(result).toEqual(mockTemplate);
    });

    it('should throw error if fromGroupId group not found', async () => {
      const createDto: CreateGroupTemplateDto = {
        name: 'Cloned Template',
        isPublic: false,
        fromGroupId: 'non-existent-id',
      };

      jest.spyOn(groupRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.createTemplate(createDto, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw error if neither config nor fromGroupId is provided', async () => {
      const createDto: CreateGroupTemplateDto = {
        name: 'Invalid Template',
        isPublic: false,
      };

      await expect(
        service.createTemplate(createDto, mockUserId),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findTemplates', () => {
    it('should return user own templates and public templates', async () => {
      const templates = [mockTemplate];
      const mockQueryBuilder: any = {
        where: jest.fn().returnThis(),
        andWhere: jest.fn().returnThis(),
        orderBy: jest.fn().returnThis(),
        skip: jest.fn().returnThis(),
        take: jest.fn().returnThis(),
        getManyAndCount: jest.fn().resolvedValue([templates, 1]),
      };

      jest
        .spyOn(templateRepository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder);

      const result = await service.findTemplates(mockUserId, 1, 10);

      expect(result.data).toEqual(templates);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(10);
    });

    it('should filter templates by search string', async () => {
      const templates = [mockTemplate];
      const mockQueryBuilder: any = {
        where: jest.fn().returnThis(),
        andWhere: jest.fn().returnThis(),
        orderBy: jest.fn().returnThis(),
        skip: jest.fn().returnThis(),
        take: jest.fn().returnThis(),
        getManyAndCount: jest.fn().resolvedValue([templates, 1]),
      };

      jest
        .spyOn(templateRepository, 'createQueryBuilder')
        .mockReturnValue(mockQueryBuilder);

      const result = await service.findTemplates(
        mockUserId,
        1,
        10,
        'USDC',
      );

      expect(result.data).toEqual(templates);
      expect(mockQueryBuilder.andWhere).toHaveBeenCalled();
    });
  });

  describe('findTemplateById', () => {
    it('should return template if user is owner', async () => {
      jest.spyOn(templateRepository, 'findOne').mockResolvedValue(mockTemplate);

      const result = await service.findTemplateById(
        mockTemplateId,
        mockOwnerId,
      );

      expect(result).toEqual(mockTemplate);
    });

    it('should return public template even if not owner', async () => {
      const publicTemplate = { ...mockTemplate, isPublic: true };
      jest
        .spyOn(templateRepository, 'findOne')
        .mockResolvedValue(publicTemplate);

      const result = await service.findTemplateById(
        mockTemplateId,
        mockUserId,
      );

      expect(result).toEqual(publicTemplate);
    });

    it('should throw ForbiddenException if template is private and not owner', async () => {
      jest.spyOn(templateRepository, 'findOne').mockResolvedValue(mockTemplate);

      await expect(
        service.findTemplateById(mockTemplateId, mockUserId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if template not found', async () => {
      jest.spyOn(templateRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.findTemplateById(mockTemplateId, mockUserId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('updateTemplate', () => {
    it('should update template if user is owner', async () => {
      const updateDto = { name: 'Updated Template' };
      const updatedTemplate = { ...mockTemplate, ...updateDto };

      jest.spyOn(templateRepository, 'findOne').mockResolvedValue(mockTemplate);
      jest.spyOn(templateRepository, 'save').mockResolvedValue(updatedTemplate);

      const result = await service.updateTemplate(
        mockTemplateId,
        updateDto as any,
        mockOwnerId,
      );

      expect(result.name).toBe('Updated Template');
      expect(templateRepository.save).toHaveBeenCalled();
    });

    it('should throw ForbiddenException if user is not owner', async () => {
      jest.spyOn(templateRepository, 'findOne').mockResolvedValue(mockTemplate);

      await expect(
        service.updateTemplate(
          mockTemplateId,
          { name: 'Updated' } as any,
          mockUserId,
        ),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if template not found', async () => {
      jest.spyOn(templateRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.updateTemplate(
          mockTemplateId,
          { name: 'Updated' } as any,
          mockOwnerId,
        ),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deleteTemplate', () => {
    it('should soft-delete template if user is owner', async () => {
      jest.spyOn(templateRepository, 'findOne').mockResolvedValue(mockTemplate);
      jest.spyOn(templateRepository, 'softRemove').mockResolvedValue(mockTemplate);

      await service.deleteTemplate(mockTemplateId, mockOwnerId);

      expect(templateRepository.softRemove).toHaveBeenCalledWith(mockTemplate);
    });

    it('should throw ForbiddenException if user is not owner', async () => {
      jest.spyOn(templateRepository, 'findOne').mockResolvedValue(mockTemplate);

      await expect(
        service.deleteTemplate(mockTemplateId, mockUserId),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw NotFoundException if template not found', async () => {
      jest.spyOn(templateRepository, 'findOne').mockResolvedValue(null);

      await expect(
        service.deleteTemplate(mockTemplateId, mockOwnerId),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('incrementUsageCount', () => {
    it('should increment usage count atomically', async () => {
      jest.spyOn(templateRepository, 'increment').mockResolvedValue({} as any);

      await service.incrementUsageCount(mockTemplateId);

      expect(templateRepository.increment).toHaveBeenCalledWith(
        { id: mockTemplateId },
        'usageCount',
        1,
      );
    });
  });

  describe('mergeTemplateConfig', () => {
    it('should merge template config with explicit DTO fields overriding template values', () => {
      const createDto = {
        name: 'New Group',
        token: 'TOKEN',
        contributionAmount: '200.00', // Override template
        roundDuration: 0, // Use default from template
        totalRounds: 0, // Use default from template
        minMembers: 0, // Use default from template
      } as any;

      const result = service.mergeTemplateConfig(mockTemplate, createDto);

      expect(result.contributionAmount).toBe('200.00'); // Explicit value wins
      expect(result.roundDuration).toBe(mockConfig.roundDuration); // Template default
      expect(result.assetCode).toBe(mockConfig.assetCode); // Template default
    });

    it('should apply all template defaults when DTO values are falsy', () => {
      const createDto = {
        name: 'New Group',
        token: 'TOKEN',
        roundDuration: 0,
        totalRounds: 0,
        minMembers: 0,
      } as any;

      const result = service.mergeTemplateConfig(mockTemplate, createDto);

      expect(result.contributionAmount).toBe(mockConfig.contributionAmount);
      expect(result.assetCode).toBe(mockConfig.assetCode);
      expect(result.assetIssuer).toBe(mockConfig.assetIssuer);
      expect(result.payoutOrderStrategy).toBe(mockConfig.payoutOrderStrategy);
      expect(result.penaltyRate).toBe(mockConfig.penaltyRate);
      expect(result.gracePeriodHours).toBe(mockConfig.gracePeriodHours);
      expect(result.timezone).toBe(mockConfig.timezone);
    });
  });
});
