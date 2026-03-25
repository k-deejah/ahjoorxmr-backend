import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  await app.listen(3000);
  console.log('Application is running on: http://localhost:3000');
  console.log(
    'Preview templates at: http://localhost:3000/api/v1/admin/email-preview/:template?lang=en',
  );
}
bootstrap();
