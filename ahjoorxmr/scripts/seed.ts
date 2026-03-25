import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SeedService } from '../src/database/seeds/seed.service';
import { SeedModule } from '../src/database/seeds/seed.module';

/**
 * Script to seed the database with sample data.
 * Usage: npm run seed
 */
async function bootstrap() {
  console.log('🌱 Starting database seeding...\n');

  const app = await NestFactory.createApplicationContext(AppModule);
  
  // Get the seed service
  const seedService = app.select(SeedModule).get(SeedService, { strict: true });

  try {
    await seedService.seed();
    console.log('\n✅ Database seeding completed successfully!');
  } catch (error) {
    console.error('\n❌ Error during seeding:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

bootstrap();
