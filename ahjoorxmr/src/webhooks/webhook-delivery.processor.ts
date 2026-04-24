import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { WebhookService } from './webhook.service';
import { WebhookDeliveryJobData } from './interfaces/webhook.interface';
import { DeadLetterService } from '../bullmq/dead-letter.service';

@Processor('webhook-delivery-queue', {
  concurrency: 5,
  limiter: { max: 50, duration: 60_000 },
})
export class WebhookDeliveryProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookDeliveryProcessor.name);

  constructor(
    private readonly webhookService: WebhookService,
    private readonly deadLetterService: DeadLetterService,
  ) {
    super();
  }

  async process(job: Job<WebhookDeliveryJobData>): Promise<any> {
    const { webhookId, url, secret, payload, attempt } = job.data;

    this.logger.log(
      `Processing webhook delivery job ${job.id} for webhook ${webhookId} (attempt ${attempt}/3)`,
    );

    try {
      const result = await this.webhookService.deliverWebhook(
        url,
        secret,
        payload,
      );

      // Check if response indicates failure (5xx errors should retry)
      if (result.statusCode >= 500) {
        throw new Error(
          `Webhook endpoint returned ${result.statusCode} status code`,
        );
      }

      this.logger.log(
        `Webhook delivered successfully to ${url} with status ${result.statusCode}`,
      );

      return result;
    } catch (error) {
      this.logger.error(
        `Failed to deliver webhook to ${url}: ${error.message}`,
      );
      throw error;
    }
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job): void {
    this.logger.log(`Webhook delivery job ${job.id} completed successfully`);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, error: Error): Promise<void> {
    const maxAttempts = job.opts?.attempts ?? 3;
    this.logger.error(
      `Webhook delivery job ${job.id} failed (attempt ${job.attemptsMade}/${maxAttempts}): ${error.message}`,
    );

    if (job.attemptsMade >= maxAttempts) {
      this.logger.error(
        `Webhook delivery job ${job.id} exhausted all retries → moving to dead-letter queue`,
      );
      await this.deadLetterService.moveToDeadLetter(
        job,
        error,
        'webhook-delivery-queue',
      );
    }
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string): void {
    this.logger.warn(`Webhook delivery job ${jobId} stalled`);
  }
}
