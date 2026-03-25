import { Test, TestingModule } from '@nestjs/testing';
import { NotificationsController } from '../../src/notifications/notifications.controller';
import { NotificationsService } from '../../src/notifications/notifications.service';
import { NotificationType } from '../../src/notifications/enums/notification-type.enum';
import { JwtAuthGuard } from '../../src/auth/guards/jwt-auth.guard';

const mockService = {
  findAll: jest.fn(),
  markAsRead: jest.fn(),
  markAllAsRead: jest.fn(),
  getUnreadCount: jest.fn(),
};

const userId = 'user-abc';

describe('NotificationsController', () => {
  let controller: NotificationsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [NotificationsController],
      providers: [{ provide: NotificationsService, useValue: mockService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<NotificationsController>(NotificationsController);
    jest.clearAllMocks();
  });

  describe('findAll()', () => {
    it('delegates to service.findAll with userId and query', async () => {
      const paginatedResult = {
        data: [],
        total: 0,
        page: 1,
        limit: 20,
        totalPages: 0,
      };
      mockService.findAll.mockResolvedValue(paginatedResult);

      const query = { page: 1, limit: 20 };
      const result = await controller.findAll(userId, query);

      expect(mockService.findAll).toHaveBeenCalledWith(userId, query);
      expect(result).toEqual(paginatedResult);
    });

    it('passes type filter through to service', async () => {
      mockService.findAll.mockResolvedValue({
        data: [],
        total: 0,
        page: 1,
        limit: 10,
        totalPages: 0,
      });

      const query = {
        page: 1,
        limit: 10,
        type: NotificationType.PAYOUT_RECEIVED,
      };
      await controller.findAll(userId, query);

      expect(mockService.findAll).toHaveBeenCalledWith(userId, query);
    });
  });

  describe('getUnreadCount()', () => {
    it('returns unread count from service', async () => {
      mockService.getUnreadCount.mockResolvedValue(3);
      const result = await controller.getUnreadCount(userId);
      expect(result).toBe(3);
      expect(mockService.getUnreadCount).toHaveBeenCalledWith(userId);
    });
  });

  describe('markAllAsRead()', () => {
    it('delegates to service.markAllAsRead', async () => {
      mockService.markAllAsRead.mockResolvedValue({ updated: 4 });
      const result = await controller.markAllAsRead(userId);
      expect(result).toEqual({ updated: 4 });
      expect(mockService.markAllAsRead).toHaveBeenCalledWith(userId);
    });
  });

  describe('markAsRead()', () => {
    it('delegates to service.markAsRead with id and userId', async () => {
      const notification = {
        id: 'uuid-1',
        userId,
        isRead: true,
        type: NotificationType.ROUND_OPENED,
        title: 'T',
        body: 'B',
        metadata: {},
        createdAt: new Date(),
      };
      mockService.markAsRead.mockResolvedValue(notification);

      const result = await controller.markAsRead('uuid-1', userId);
      expect(result).toEqual(notification);
      expect(mockService.markAsRead).toHaveBeenCalledWith('uuid-1', userId);
    });
  });
});
