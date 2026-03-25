import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('email')
export class EmailProcessor extends WorkerHost {
  async process(job: Job): Promise<any> {
    const { to, subject, body } = job.data;

    // Simulate email sending
    console.log(`Sending email to ${to}: ${subject}`);

    // Simulate processing time
    await new Promise((resolve) => setTimeout(resolve, 1000));

    return { sent: true, to, subject };
  }
}
