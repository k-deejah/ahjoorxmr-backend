import { Test, TestingModule } from '@nestjs/testing';
import { GroupTemplatesController } from './group-templates.controller';
import { GroupTemplatesService } from './group-templates.service';
import { CreateGroupTemplateDto } from './dto/group-template.dto';
import { GroupTemplate, GroupTemplateConfig } from './entities/group-template.entity';

describe('GroupTemplatesController', () => {
  let controller: GroupTemplatesController;
  let service: GroupTemplatesService;

  const mockUserId = '550e8400-e29b-41d4-a716-446655440000';
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
    ownerId: mockUserId,
    usageCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
    owner: null,
  };

  const mockRequest = { user: { id: mockUserId } };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GroupTemplatesController],
      providers: [
        {
          provide: GroupTemplatesService,
          useValue: {
            createTemplate: jest.fn(),
            findTemplates: jest.fn(),
            findTemplateById: jest.fn(),
            updateTemplate: jest.fn(),
            deleteTemplate: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<GroupTemplatesController>(
      GroupTemplatesController,
    );
    service = module.get<GroupTemplatesService>(GroupTemplatesService);
  });

  describe('createTemplate', () => {
    it('should create a template', async () => {
      const createDto: CreateGroupTemplateDto = {
        name: 'Test Template',
        description: 'A test template',
        isPublic: false,
        config: mockConfig as any,
      };

      jest.spyOn(service, 'createTemplate').mockResolvedValue(mockTemplate);

      const result = await controller.createTemplate(mockRequest as any, createDto);

      expect(service.createTemplate).toHaveBeenCalledWith(createDto, mockUserId);
      expect(result.id).toBe(mockTemplateId);
      expect(result.name).toBe('Test Template');
    });
  });

  describe('getTemplates', () => {
    it('should return paginated templates', async () => {
      const mockResult = {
        data: [mockTemplate],
        total: 1,
        page: 1,
        limit: 10,
      };

      jest.spyOn(service, 'findTemplates').mockResolvedValue(mockResult);

      const result = await controller.getTemplates(
        mockRequest as any,
        1,
        10,
        undefined,
      );

      expect(service.findTemplates).toHaveBeenCalledWith(
        mockUserId,
        1,
        10,
        undefined,
      );
      expect(result.data).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it('should support search parameter', async () => {
      const mockResult = {
        data: [mockTemplate],
        total: 1,
        page: 1,
        limit: 10,
      };

      jest.spyOn(service, 'findTemplates').mockResolvedValue(mockResult);

      await controller.getTemplates(mockRequest as any, 1, 10, 'USDC');

      expect(service.findTemplates).toHaveBeenCalledWith(
        mockUserId,
        1,
        10,
        'USDC',
      );
    });
  });

  describe('getTemplate', () => {
    it('should return a single template', async () => {
      jest
        .spyOn(service, 'findTemplateById')
        .mockResolvedValue(mockTemplate);

      const result = await controller.getTemplate(
        mockRequest as any,
        mockTemplateId,
      );

      expect(service.findTemplateById).toHaveBeenCalledWith(
        mockTemplateId,
        mockUserId,
      );
      expect(result.id).toBe(mockTemplateId);
    });
  });

  describe('updateTemplate', () => {
    it('should update a template', async () => {
      const updateDto = { name: 'Updated Template' };
      const updatedTemplate = { ...mockTemplate, ...updateDto };

      jest
        .spyOn(service, 'updateTemplate')
        .mockResolvedValue(updatedTemplate);

      const result = await controller.updateTemplate(
        mockRequest as any,
        mockTemplateId,
        updateDto as any,
      );

      expect(service.updateTemplate).toHaveBeenCalledWith(
        mockTemplateId,
        updateDto,
        mockUserId,
      );
      expect(result.name).toBe('Updated Template');
    });
  });

  describe('deleteTemplate', () => {
    it('should delete a template', async () => {
      jest.spyOn(service, 'deleteTemplate').mockResolvedValue(undefined);

      await controller.deleteTemplate(mockRequest as any, mockTemplateId);

      expect(service.deleteTemplate).toHaveBeenCalledWith(
        mockTemplateId,
        mockUserId,
      );
    });
  });
});
