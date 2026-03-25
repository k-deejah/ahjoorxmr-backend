import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';
import { AppController } from './app.controller';
import { QueuesModule } from './queues/queues.module';
import { BullBoardConfigModule } from './bull-board/bull-board.module';
import { AdminGuard } from './guards/admin.guard';
import { BullBoardAuthMiddleware } from './middleware/bull-board-auth.middleware';

@Module({
  imports: [BullBoardConfigModule, QueuesModule],
  controllers: [AppController],
  providers: [AdminGuard],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    // Apply admin authentication middleware to Bull Board routes
    consumer.apply(BullBoardAuthMiddleware).forRoutes('/admin/queues*');
  }
}
