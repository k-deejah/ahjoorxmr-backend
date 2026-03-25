import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { QueueService } from './queue.service';

@Injectable()
export class BullBoardService {
  private readonly logger = new Logger(BullBoardService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly queueService: QueueService,
  ) {}

  /**
   * Mount bull-board at /admin/queues (non-production only).
   * Call this in main.ts after app.init():
   *   const bullBoard = app.get(BullBoardService);
   *   bullBoard.mount(app);
   */
  async mount(app: INestApplication): Promise<void> {
    const env = this.configService.get<string>('NODE_ENV', 'development');
    if (env === 'production') {
      this.logger.log('BullBoard disabled in production');
      return;
    }

    try {
      // Dynamic imports so the build does not fail if @bull-board/* is absent
      const { createBullBoard } = await import('@bull-board/api');
      const { BullMQAdapter } = await import('@bull-board/api/bullMQAdapter');
      const { ExpressAdapter } = await import('@bull-board/express');

      const serverAdapter = new ExpressAdapter();
      serverAdapter.setBasePath('/admin/queues');

      createBullBoard({
        queues: this.queueService.getQueues().map((q) => new BullMQAdapter(q)),
        serverAdapter,
      });

      const httpAdapter = app.getHttpAdapter();
      httpAdapter.getInstance().use('/admin/queues', serverAdapter.getRouter());

      this.logger.log(`BullBoard mounted at /admin/queues (env=${env})`);
    } catch (err) {
      this.logger.warn(
        `BullBoard could not be mounted (is @bull-board/* installed?): ${(err as Error).message}`,
      );
    }
  }
}
