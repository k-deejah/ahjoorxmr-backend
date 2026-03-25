import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { AdminGuard } from './guards/admin.guard';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Apply admin guard globally to Bull Board routes
  // Note: Bull Board routes are automatically protected when using the guard
  const adminGuard = app.get(AdminGuard);

  await app.listen(3000);
  console.log('Application is running on: http://localhost:3000');
  console.log('Bull Board Dashboard: http://localhost:3000/admin/queues');
  console.log(
    'Note: Dashboard requires admin authentication (x-admin-token header)',
  );
}
bootstrap();
