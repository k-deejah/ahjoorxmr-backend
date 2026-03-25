import { Controller, Get, Post, Body, UseGuards } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { AdminGuard } from './guards/admin.guard';

@Controller()
export class AppController {
  constructor(
    @InjectQueue('email') private emailQueue: Queue,
    @InjectQueue('notifications') private notificationsQueue: Queue,
    @InjectQueue('payments') private paymentsQueue: Queue,
  ) {}

  @Get()
  getStatus() {
    return {
      status: 'ok',
      message: 'BullMQ with Bull Board is running',
      dashboardUrl: '/admin/queues',
    };
  }

  // Example endpoints to add jobs for testing
  @Post('jobs/email')
  async addEmailJob(
    @Body() data: { to: string; subject: string; body: string },
  ) {
    const job = await this.emailQueue.add('send-email', data);
    return { jobId: job.id, queue: 'email' };
  }

  @Post('jobs/notification')
  async addNotificationJob(
    @Body() data: { userId: string; message: string; type: string },
  ) {
    const job = await this.notificationsQueue.add('send-notification', data);
    return { jobId: job.id, queue: 'notifications' };
  }

  @Post('jobs/payment')
  async addPaymentJob(
    @Body() data: { orderId: string; amount: number; currency: string },
  ) {
    const job = await this.paymentsQueue.add('process-payment', data, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 2000,
      },
    });
    return { jobId: job.id, queue: 'payments' };
  }
}
