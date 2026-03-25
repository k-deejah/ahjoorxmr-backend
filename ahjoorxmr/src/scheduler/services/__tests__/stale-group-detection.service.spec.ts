import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { StaleGroupDetectionService } from '../stale-group-detection.service';
import { Group } from '../../../groups/entities/group.entity';
import { GroupStatus } from '../../../groups/entities/group-status.enum';
import { NotificationsService } from '../../../notification/notifications.service';
import { NotificationType } from '../../../notification/notification-type.enum';

describe('StaleGroupDetectionService', () => {
  let service: StaleGroupDetectionService;
  let groupRepository: jest.Mocked<Repository<Group>>;
  let notificationsService: jest.Mocked<NotificationsService>;
  let configService: jest.Mocked<ConfigService>;

  const mockGroup = (overrides: Partial<Group> = {}): Group => ({
    id: 'group-1',
    name: 'Test Group',
    contractAddress: 'CTEST123',
    adminWallet: 'GADMIN123',
    contributionAmount: '100',
    token: 'USDC',
    roundDuration: 2592000,
    status: GroupStatus.ACTIVE,
    currentRound: 1,
    totalRounds: 10,
    minMembers: 3,
    staleAt: null,
    deletedAt: null,
    memberships: [],
    createdAt: new Date('2024-01-01'),
    updatedAt: new Date('2024-01-01'),
    ...overrides,
  });

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StaleGroupDetectionService,
        {
          provide: getRepositoryToken(Group),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            notify: jest.fn(),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key: string, defaultValue?: any) => {
              if (key === 'MAX_STALE_GROUP_DAYS') return 7;
              return defaultValue;
            }),
          },
        },
      ],
    }).compile();

    service = module.get<StaleGroupDetectionService>(
      StaleGroupDetectionService,
    );
    groupRepository = module.get(getRepositoryToken(Group));
    notificationsService = module.get(NotificationsService);
    configService = module.get(ConfigService);
  });

  describe('detectAndFlagStaleGroups', () => {
    it('should detect and flag stale groups', async () => {
      const staleGroup = mockGroup({
        id: 'stale-group-1',
        name: 'Stale Group',
        updatedAt: new Date('2024-01-01'),
        staleAt: null,
      });

      groupRepository.find.mockResolvedValue([staleGroup]);
      groupRepository.save.mockResolvedValue({
        ...staleGroup,
        staleAt: new Date(),
      });

      const result = await service.detectAndFlagStaleGroups();

      expect(result).toBe(1);
      expect(groupRepository.find).toHaveBeenCalledWith({
        where: {
          status: GroupStatus.ACTIVE,
          updatedAt: expect.any(Date),
          staleAt: null,
        },
        relations: ['memberships'],
      });
      expect(groupRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'stale-group-1',
          staleAt: expect.any(Date),
        }),
      );
      expect(notificationsService.notify).toHaveBeenCalledWith({
        userId: 'GADMIN123',
        type: NotificationType.SYSTEM_ALERT,
        title: 'Stale Group Detected',
        body: expect.stringContaining('Stale Group'),
        metadata: expect.objectContaining({
          groupId: 'stale-group-1',
          groupName: 'Stale Group',
          staleDays: 7,
        }),
      });
    });

    it('should handle multiple stale groups', async () => {
      const staleGroups = [
        mockGroup({ id: 'group-1', name: 'Group 1' }),
        mockGroup({ id: 'group-2', name: 'Group 2' }),
        mockGroup({ id: 'group-3', name: 'Group 3' }),
      ];

      groupRepository.find.mockResolvedValue(staleGroups);
      groupRepository.save.mockImplementation((group) =>
        Promise.resolve({ ...group, staleAt: new Date() }),
      );

      const result = await service.detectAndFlagStaleGroups();

      expect(result).toBe(3);
      expect(groupRepository.save).toHaveBeenCalledTimes(3);
      expect(notificationsService.notify).toHaveBeenCalledTimes(3);
    });

    it('should return 0 when no stale groups found', async () => {
      groupRepository.find.mockResolvedValue([]);

      const result = await service.detectAndFlagStaleGroups();

      expect(result).toBe(0);
      expect(groupRepository.save).not.toHaveBeenCalled();
      expect(notificationsService.notify).not.toHaveBeenCalled();
    });

    it('should skip groups already flagged as stale', async () => {
      const alreadyStaleGroup = mockGroup({
        staleAt: new Date('2024-01-10'),
      });

      groupRepository.find.mockResolvedValue([alreadyStaleGroup]);

      const result = await service.detectAndFlagStaleGroups();

      // The query should filter out already stale groups
      expect(groupRepository.find).toHaveBeenCalledWith({
        where: expect.objectContaining({
          staleAt: null,
        }),
        relations: ['memberships'],
      });
    });

    it('should continue processing if one group fails', async () => {
      const group1 = mockGroup({ id: 'group-1', name: 'Group 1' });
      const group2 = mockGroup({ id: 'group-2', name: 'Group 2' });

      groupRepository.find.mockResolvedValue([group1, group2]);
      groupRepository.save
        .mockRejectedValueOnce(new Error('Database error'))
        .mockResolvedValueOnce({ ...group2, staleAt: new Date() });

      const result = await service.detectAndFlagStaleGroups();

      expect(result).toBe(1);
      expect(groupRepository.save).toHaveBeenCalledTimes(2);
      expect(notificationsService.notify).toHaveBeenCalledTimes(1);
    });

    it('should use configured MAX_STALE_GROUP_DAYS', async () => {
      configService.get.mockReturnValue(14);

      const module: TestingModule = await Test.createTestingModule({
        providers: [
          StaleGroupDetectionService,
          {
            provide: getRepositoryToken(Group),
            useValue: groupRepository,
          },
          {
            provide: NotificationsService,
            useValue: notificationsService,
          },
          {
            provide: ConfigService,
            useValue: configService,
          },
        ],
      }).compile();

      const customService = module.get<StaleGroupDetectionService>(
        StaleGroupDetectionService,
      );

      groupRepository.find.mockResolvedValue([]);

      await customService.detectAndFlagStaleGroups();

      expect(configService.get).toHaveBeenCalledWith('MAX_STALE_GROUP_DAYS', 7);
    });
  });

  describe('clearStaleFlag', () => {
    it('should clear stale flag for a group', async () => {
      const staleGroup = mockGroup({
        id: 'group-1',
        staleAt: new Date('2024-01-10'),
      });

      groupRepository.findOne.mockResolvedValue(staleGroup);
      groupRepository.save.mockResolvedValue({
        ...staleGroup,
        staleAt: null,
      });

      await service.clearStaleFlag('group-1');

      expect(groupRepository.findOne).toHaveBeenCalledWith({
        where: { id: 'group-1' },
      });
      expect(groupRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'group-1',
          staleAt: null,
        }),
      );
    });

    it('should do nothing if group not found', async () => {
      groupRepository.findOne.mockResolvedValue(null);

      await service.clearStaleFlag('non-existent');

      expect(groupRepository.save).not.toHaveBeenCalled();
    });

    it('should do nothing if group is not stale', async () => {
      const nonStaleGroup = mockGroup({
        staleAt: null,
      });

      groupRepository.findOne.mockResolvedValue(nonStaleGroup);

      await service.clearStaleFlag('group-1');

      expect(groupRepository.save).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      groupRepository.findOne.mockRejectedValue(new Error('Database error'));

      await expect(service.clearStaleFlag('group-1')).resolves.not.toThrow();
    });
  });
});
