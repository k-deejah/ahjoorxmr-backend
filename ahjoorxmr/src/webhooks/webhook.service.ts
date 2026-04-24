import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHmac } from 'crypto';
import axios from 'axios';
import { Webhook } from './entities/webhook.entity';
import {
  WebhookPayload,
  WebhookDeliveryJobData,
  ContributionVerifiedPayload,
} from './interfaces/webhook.interface';
import { Contribution } from '../contributions/entities/contribution.entity';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    @InjectRepository(Webhook)
    private readonly webhookRepository: Repository<Webhook>,
    @InjectQueue('webhook-delivery-queue')
    private readonly webhookQueue: Queue,
  ) {}

  /**
   * Generate HMAC-SHA256 signature for webhook payload
   */
  private generateSignature(payload: string, secret: string): string {
    const hmac = createHmac('sha256', secret);
    hmac.update(payload);
    return `sha256=${hmac.digest('hex')}`;
  }

  /**
   * Send webhook notification for contribution verified event
   */
  async notifyContributionVerified(contribution: Contribution): Promise<void> {
    const webhooks = await this.webhookRepository.find({
      where: {
        isActive: true,
      },
    });

    const eventType = 'contribution.verified';
    const relevantWebhooks = webhooks.filter((webhook) =>
      webhook.eventTypes.includes(eventType),
    );

    if (relevantWebhooks.length === 0) {
      this.logger.debug(
        `No active webhooks found for event type: ${eventType}`,
      );
      return;
    }

    const payload: WebhookPayload = {
      event: eventType,
      timestamp: new Date().toISOString(),
      data: {
        contributionId: contribution.id,
        groupId: contribution.groupId,
        userId: contribution.userId,
        walletAddress: contribution.walletAddress,
        amount: contribution.amount,
        roundNumber: contribution.roundNumber,
        transactionHash: contribution.transactionHash,
        timestamp: contribution.timestamp,
      } as ContributionVerifiedPayload,
    };

    for (const webhook of relevantWebhooks) {
      const jobData: WebhookDeliveryJobData = {
        webhookId: webhook.id,
        url: webhook.url,
        secret: webhook.secret,
        payload,
        attempt: 1,
      };

      await this.webhookQueue.add('deliver-webhook', jobData, {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 5000,
        },
        removeOnComplete: { count: 1000, age: 24 * 60 * 60 },
        removeOnFail: false,
      });

      this.logger.log(
        `Queued webhook delivery for webhook ${webhook.id} to ${webhook.url}`,
      );
    }
  }

  /**
   * Deliver webhook with HMAC signature
   */
  async deliverWebhook(
    url: string,
    secret: string,
    payload: WebhookPayload,
  ): Promise<{ statusCode: number; responseBody: any; deliveryTime: number }> {
    const startTime = Date.now();
    const payloadString = JSON.stringify(payload);
    const signature = this.generateSignature(payloadString, secret);

    try {
      const response = await axios.post(url, payload, {
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': signature,
          'User-Agent': 'Ahjoorxmr-Webhook/1.0',
        },
        timeout: 10000,
        validateStatus: (status) => status < 600,
      });

      const deliveryTime = Date.now() - startTime;

      this.logger.log(
        `Webhook delivered to ${url} with status ${response.status} in ${deliveryTime}ms`,
      );

      return {
        statusCode: response.status,
        responseBody: response.data,
        deliveryTime,
      };
    } catch (error) {
      const deliveryTime = Date.now() - startTime;
      this.logger.error(
        `Failed to deliver webhook to ${url}: ${error.message}`,
      );

      throw error;
    }
  }

  /**
   * Test webhook endpoint with synthetic event
   */
  async testWebhook(
    webhookId: string,
  ): Promise<{ statusCode: number; responseBody: any; deliveryTime: number }> {
    const webhook = await this.webhookRepository.findOne({
      where: { id: webhookId },
    });

    if (!webhook) {
      throw new Error('Webhook not found');
    }

    const testPayload: WebhookPayload = {
      event: 'contribution.verified',
      timestamp: new Date().toISOString(),
      data: {
        contributionId: '00000000-0000-0000-0000-000000000000',
        groupId: '00000000-0000-0000-0000-000000000000',
        userId: webhook.userId,
        walletAddress: 'GTEST...',
        amount: '100',
        roundNumber: 1,
        transactionHash: 'test_transaction_hash',
        timestamp: new Date(),
      } as ContributionVerifiedPayload,
    };

    return this.deliverWebhook(webhook.url, webhook.secret, testPayload);
  }

  /**
   * Create a new webhook
   */
  async createWebhook(
    userId: string,
    url: string,
    eventTypes: string[],
  ): Promise<Webhook> {
    const secret = this.generateWebhookSecret();

    const webhook = this.webhookRepository.create({
      userId,
      url,
      secret,
      eventTypes,
      isActive: true,
    });

    return this.webhookRepository.save(webhook);
  }

  /**
   * Get all webhooks for a user
   */
  async getUserWebhooks(userId: string): Promise<Webhook[]> {
    return this.webhookRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * Delete a webhook
   */
  async deleteWebhook(webhookId: string, userId: string): Promise<void> {
    const result = await this.webhookRepository.delete({
      id: webhookId,
      userId,
    });

    if (result.affected === 0) {
      throw new Error('Webhook not found or unauthorized');
    }
  }

  /**
   * Generate a secure random secret for webhook signing
   */
  private generateWebhookSecret(): string {
    return require('crypto').randomBytes(32).toString('hex');
  }
}
