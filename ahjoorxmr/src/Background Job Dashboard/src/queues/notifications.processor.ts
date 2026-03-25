import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('notifications')
export class NotificationsProcessor extends WorkerHost {
  async process(job: Job): Promise<any> {
    const { userId, message, type } = job.data;

    console.log(`Sending ${type} notification to user ${userId}: ${message}`);

    await new Promise((resolve) => setTimeout(resolve, 500));

    return { sent: true, userId, type };
  }
}
