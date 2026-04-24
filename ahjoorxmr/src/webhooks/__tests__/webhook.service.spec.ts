import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bullmq';
import { WebhookService } from '../webhook.service';
import { Webhook } from '../entities/webhook.entity';
import { Repository } from 'typeorm';
import { Queue } from 'bullmq';

describe('WebhookService', () => {
  let service: WebhookService;
  let webhookRepository: jest.Mocked<Repository<Webhook>>;
  let webhookQueue: jest.Mocked<Queue>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WebhookService,
        {
          provide: getRepositoryToken(Webhook),
          useValue: {
            find: jest.fn(),
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getQueueToken('webhook-delivery-queue'),
          useValue: {
            add: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<WebhookService>(WebhookService);
    webhookRepository = module.get(getRepositoryToken(Webhook));
    webhookQueue = module.get(getQueueToken('webhook-delivery-queue'));
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createWebhook', () => {
    it('should create a webhook with generated secret', async () => {
      const userId = 'user-123';
      const url = 'https://example.com/webhook';
      const eventTypes = ['contribution.verified'];

      const mockWebhook = {
        id: 'webhook-123',
        userId,
        url,
        eventTypes,
        secret: 'generated-secret',
        isActive: true,
      } as Webhook;

      webhookRepository.create.mockReturnValue(mockWebhook);
      webhookRepository.save.mockResolvedValue(mockWebhook);

      const result = await service.createWebhook(userId, url, eventTypes);

      expect(result).toEqual(mockWebhook);
      expect(webhookRepository.create).toHaveBeenCalledWith({
        userId,
        url,
        secret: expect.any(String),
        eventTypes,
        isActive: true,
      });
      expect(webhookRepository.save).toHaveBeenCalled();
    });
  });

  describe('getUserWebhooks', () => {
    it('should return all webhooks for a user', async () => {
      const userId = 'user-123';
      const mockWebhooks = [
        {
          id: 'webhook-1',
          userId,
          url: 'https://example.com/webhook1',
          eventTypes: ['contribution.verified'],
        },
        {
          id: 'webhook-2',
          userId,
          url: 'https://example.com/webhook2',
          eventTypes: ['contribution.verified'],
        },
      ] as Webhook[];

      webhookRepository.find.mockResolvedValue(mockWebhooks);

      const result = await service.getUserWebhooks(userId);

      expect(result).toEqual(mockWebhooks);
      expect(webhookRepository.find).toHaveBeenCalledWith({
        where: { userId },
        order: { createdAt: 'DESC' },
      });
    });
  });

  describe('deleteWebhook', () => {
    it('should delete a webhook', async () => {
      const webhookId = 'webhook-123';
      const userId = 'user-123';

      webhookRepository.delete.mockResolvedValue({ affected: 1, raw: {} });

      await service.deleteWebhook(webhookId, userId);

      expect(webhookRepository.delete).toHaveBeenCalledWith({
        id: webhookId,
        userId,
      });
    });

    it('should throw error if webhook not found', async () => {
      const webhookId = 'webhook-123';
      const userId = 'user-123';

      webhookRepository.delete.mockResolvedValue({ affected: 0, raw: {} });

      await expect(service.deleteWebhook(webhookId, userId)).rejects.toThrow(
        'Webhook not found or unauthorized',
      );
    });
  });

  describe('notifyContributionVerified', () => {
    it('should queue webhook delivery jobs for matching webhooks', async () => {
      const contribution = {
        id: 'contrib-123',
        groupId: 'group-123',
        userId: 'user-123',
        walletAddress: 'GTEST...',
        amount: '100',
        roundNumber: 1,
        transactionHash: 'tx-hash',
        timestamp: new Date(),
      } as any;

      const mockWebhooks = [
        {
          id: 'webhook-1',
          userId: 'user-123',
          url: 'https://example.com/webhook1',
          secret: 'secret-1',
          eventTypes: ['contribution.verified'],
          isActive: true,
        },
        {
          id: 'webhook-2',
          userId: 'user-456',
          url: 'https://example.com/webhook2',
          secret: 'secret-2',
          eventTypes: ['contribution.verified'],
          isActive: true,
        },
      ] as Webhook[];

      webhookRepository.find.mockResolvedValue(mockWebhooks);
      webhookQueue.add.mockResolvedValue({} as any);

      await service.notifyContributionVerified(contribution);

      expect(webhookQueue.add).toHaveBeenCalledTimes(2);
      expect(webhookQueue.add).toHaveBeenCalledWith(
        'deliver-webhook',
        expect.objectContaining({
          webhookId: 'webhook-1',
          url: 'https://example.com/webhook1',
          secret: 'secret-1',
          payload: expect.objectContaining({
            event: 'contribution.verified',
            data: expect.objectContaining({
              contributionId: 'contrib-123',
            }),
          }),
        }),
        expect.any(Object),
      );
    });

    it('should not queue jobs for inactive webhooks', async () => {
      const contribution = {
        id: 'contrib-123',
        groupId: 'group-123',
        userId: 'user-123',
      } as any;

      const mockWebhooks = [] as Webhook[]; // No active webhooks

      webhookRepository.find.mockResolvedValue(mockWebhooks);

      await service.notifyContributionVerified(contribution);

      expect(webhookQueue.add).not.toHaveBeenCalled();
    });
  });
});
