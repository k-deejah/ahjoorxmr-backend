import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';

@Processor('payments')
export class PaymentsProcessor extends WorkerHost {
  async process(job: Job): Promise<any> {
    const { orderId, amount, currency } = job.data;

    console.log(
      `Processing payment for order ${orderId}: ${amount} ${currency}`,
    );

    // Simulate payment processing
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Simulate occasional failures for testing
    if (Math.random() < 0.1) {
      throw new Error('Payment gateway timeout');
    }

    return { processed: true, orderId, amount };
  }
}
