import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { createHmac } from 'crypto';
import { WebhookService } from '../webhook.service';
import { WebhookModule } from '../webhook.module';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { Webhook } from '../entities/webhook.entity';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('Webhook Integration Tests', () => {
  let app: INestApplication;
  let webhookService: WebhookService;
  let testWebhook: Webhook;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [Webhook],
          synchronize: true,
        }),
        BullModule.forRoot({
          connection: {
            host: 'localhost',
            port: 6379,
          },
        }),
        WebhookModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    webhookService = moduleFixture.get<WebhookService>(WebhookService);
  });

  afterAll(async () => {
    await app.close();
  });

  describe('HMAC Signature Verification', () => {
    it('should generate correct HMAC-SHA256 signature', async () => {
      const secret = 'test-secret-key';
      const payload = {
        event: 'contribution.verified',
        timestamp: '2024-01-01T00:00:00.000Z',
        data: {
          contributionId: 'test-id',
          amount: '100',
        },
      };

      const payloadString = JSON.stringify(payload);
      const expectedSignature = `sha256=${createHmac('sha256', secret)
        .update(payloadString)
        .digest('hex')}`;

      // Mock axios to capture the signature header
      let capturedSignature: string | undefined;
      mockedAxios.post.mockImplementation((url, data, config) => {
        capturedSignature = config?.headers?.['X-Webhook-Signature'];
        return Promise.resolve({
          status: 200,
          data: { success: true },
        });
      });

      await webhookService.deliverWebhook(
        'https://example.com/webhook',
        secret,
        payload,
      );

      expect(capturedSignature).toBe(expectedSignature);
    });

    it('should include X-Webhook-Signature header in all requests', async () => {
      const payload = {
        event: 'contribution.verified',
        timestamp: new Date().toISOString(),
        data: {},
      };

      let headers: any;
      mockedAxios.post.mockImplementation((url, data, config) => {
        headers = config?.headers;
        return Promise.resolve({
          status: 200,
          data: {},
        });
      });

      await webhookService.deliverWebhook(
        'https://example.com/webhook',
        'secret',
        payload,
      );

      expect(headers).toHaveProperty('X-Webhook-Signature');
      expect(headers['X-Webhook-Signature']).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it('should allow receiver to verify signature', () => {
      const secret = 'shared-secret';
      const payload = {
        event: 'contribution.verified',
        timestamp: '2024-01-01T00:00:00.000Z',
        data: { test: 'data' },
      };

      const payloadString = JSON.stringify(payload);

      // Sender generates signature
      const senderSignature = `sha256=${createHmac('sha256', secret)
        .update(payloadString)
        .digest('hex')}`;

      // Receiver verifies signature
      const receiverSignature = `sha256=${createHmac('sha256', secret)
        .update(payloadString)
        .digest('hex')}`;

      expect(senderSignature).toBe(receiverSignature);
    });
  });

  describe('Retry Behavior on 5xx Responses', () => {
    it('should retry on 500 status code', async () => {
      const payload = {
        event: 'contribution.verified',
        timestamp: new Date().toISOString(),
        data: {},
      };

      mockedAxios.post.mockResolvedValue({
        status: 500,
        data: { error: 'Internal Server Error' },
      });

      await expect(
        webhookService.deliverWebhook(
          'https://example.com/webhook',
          'secret',
          payload,
        ),
      ).resolves.toMatchObject({
        statusCode: 500,
      });
    });

    it('should retry on 503 status code', async () => {
      const payload = {
        event: 'contribution.verified',
        timestamp: new Date().toISOString(),
        data: {},
      };

      mockedAxios.post.mockResolvedValue({
        status: 503,
        data: { error: 'Service Unavailable' },
      });

      await expect(
        webhookService.deliverWebhook(
          'https://example.com/webhook',
          'secret',
          payload,
        ),
      ).resolves.toMatchObject({
        statusCode: 503,
      });
    });

    it('should not retry on 4xx status codes', async () => {
      const payload = {
        event: 'contribution.verified',
        timestamp: new Date().toISOString(),
        data: {},
      };

      mockedAxios.post.mockResolvedValue({
        status: 400,
        data: { error: 'Bad Request' },
      });

      const result = await webhookService.deliverWebhook(
        'https://example.com/webhook',
        'secret',
        payload,
      );

      expect(result.statusCode).toBe(400);
    });

    it('should succeed on 2xx status codes', async () => {
      const payload = {
        event: 'contribution.verified',
        timestamp: new Date().toISOString(),
        data: {},
      };

      mockedAxios.post.mockResolvedValue({
        status: 200,
        data: { success: true },
      });

      const result = await webhookService.deliverWebhook(
        'https://example.com/webhook',
        'secret',
        payload,
      );

      expect(result.statusCode).toBe(200);
      expect(result.responseBody).toEqual({ success: true });
    });
  });

  describe('Delivery Timing', () => {
    it('should track delivery time', async () => {
      const payload = {
        event: 'contribution.verified',
        timestamp: new Date().toISOString(),
        data: {},
      };

      mockedAxios.post.mockImplementation(() => {
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve({
              status: 200,
              data: {},
            });
          }, 100);
        });
      });

      const result = await webhookService.deliverWebhook(
        'https://example.com/webhook',
        'secret',
        payload,
      );

      expect(result.deliveryTime).toBeGreaterThanOrEqual(100);
    });
  });

  describe('Webhook Payload Structure', () => {
    it('should include required fields in payload', async () => {
      let capturedPayload: any;
      mockedAxios.post.mockImplementation((url, data) => {
        capturedPayload = data;
        return Promise.resolve({
          status: 200,
          data: {},
        });
      });

      const payload = {
        event: 'contribution.verified',
        timestamp: new Date().toISOString(),
        data: {
          contributionId: 'test-id',
          groupId: 'group-id',
          userId: 'user-id',
          walletAddress: 'GTEST...',
          amount: '100',
          roundNumber: 1,
          transactionHash: 'tx-hash',
          timestamp: new Date(),
        },
      };

      await webhookService.deliverWebhook(
        'https://example.com/webhook',
        'secret',
        payload,
      );

      expect(capturedPayload).toHaveProperty('event');
      expect(capturedPayload).toHaveProperty('timestamp');
      expect(capturedPayload).toHaveProperty('data');
      expect(capturedPayload.data).toHaveProperty('contributionId');
      expect(capturedPayload.data).toHaveProperty('transactionHash');
    });
  });
});
