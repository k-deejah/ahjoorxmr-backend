import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { QUEUE_NAMES, JOB_NAMES, BACKOFF_DELAYS } from './queue.constants';
import {
  SendEmailJobData,
  SendNotificationEmailJobData,
  SendWelcomeEmailJobData,
} from './queue.interfaces';
import { DeadLetterService } from './dead-letter.service';
import { MailService } from '../mail/mail.service';

@Processor(QUEUE_NAMES.EMAIL, {
  concurrency: 5,
  limiter: { max: 50, duration: 60_000 },
})
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(
    private readonly deadLetterService: DeadLetterService,
    private readonly mailService: MailService,
  ) {
    super();
  }

  async process(job: Job): Promise<unknown> {
    this.logger.debug(`Processing email job [${job.name}] id=${job.id}`);

    switch (job.name) {
      case JOB_NAMES.SEND_EMAIL:
        return this.handleSendEmail(job as Job<SendEmailJobData>);
      case JOB_NAMES.SEND_NOTIFICATION_EMAIL:
        return this.handleSendNotificationEmail(
          job as Job<SendNotificationEmailJobData>,
        );
      case JOB_NAMES.SEND_WELCOME_EMAIL:
        return this.handleSendWelcomeEmail(job as Job<SendWelcomeEmailJobData>);
      default:
        throw new Error(`Unknown email job type: ${job.name}`);
    }
  }

  private async handleSendEmail(job: Job<SendEmailJobData>): Promise<void> {
    const { to, subject, html, text, template, context } = job.data;
    this.logger.log(
      `Sending email to=${JSON.stringify(to)} subject="${subject}"`,
    );

    await this.mailService.sendMail({
      to,
      subject,
      html,
      text,
      template,
      context,
    });
    this.logger.log(`Email sent successfully to=${JSON.stringify(to)}`);
  }

  private async handleSendNotificationEmail(
    job: Job<SendNotificationEmailJobData>,
  ): Promise<void> {
    const { userId, notificationType, to, subject, body, actionLink } =
      job.data;
    this.logger.log(
      `Sending notification email userId=${userId} type=${notificationType} to=${to}`,
    );

    const recipient = Array.isArray(to) ? to[0] : to;
    await this.mailService.sendNotificationEmail(
      recipient,
      userId,
      subject,
      body,
      actionLink,
    );
    this.logger.log(`Notification email sent userId=${userId}`);
  }

  private async handleSendWelcomeEmail(
    job: Job<SendWelcomeEmailJobData>,
  ): Promise<void> {
    const { userId, email, username } = job.data;
    this.logger.log(`Sending welcome email userId=${userId} email=${email}`);

    await this.mailService.sendWelcomeEmail(email, username);
    this.logger.log(`Welcome email sent userId=${userId}`);
  }

  @OnWorkerEvent('completed')
  onCompleted(job: Job): void {
    this.logger.log(`Email job completed [${job.name}] id=${job.id}`);
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, error: Error): Promise<void> {
    const maxAttempts = job.opts?.attempts ?? 3;
    this.logger.error(
      `Email job failed [${job.name}] id=${job.id} attempt=${job.attemptsMade}/${maxAttempts}: ${error.message}`,
      error.stack,
    );

    if (job.attemptsMade >= maxAttempts) {
      this.logger.error(
        `Email job [${job.name}] id=${job.id} exhausted all retries → moving to dead-letter queue`,
      );
      await this.deadLetterService.moveToDeadLetter(
        job,
        error,
        QUEUE_NAMES.EMAIL,
      );
    }
  }

  @OnWorkerEvent('stalled')
  onStalled(jobId: string): void {
    this.logger.warn(`Email job stalled id=${jobId}`);
  }
}

export function emailBackoffStrategy(attemptsMade: number): number {
  return (
    BACKOFF_DELAYS[attemptsMade] ?? BACKOFF_DELAYS[BACKOFF_DELAYS.length - 1]
  );
}
