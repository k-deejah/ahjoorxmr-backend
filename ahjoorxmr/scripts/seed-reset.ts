import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { SeedService } from '../src/database/seeds/seed.service';
import { SeedModule } from '../src/database/seeds/seed.module';

/**
 * Script to clear and re-seed the database.
 * Usage: npm run seed:reset
 */
async function bootstrap() {
  console.log('🔄 Resetting database...\n');
  console.log('⚠️  WARNING: This will delete all existing data!\n');

  const app = await NestFactory.createApplicationContext(AppModule);
  
  // Get the seed service
  const seedService = app.select(SeedModule).get(SeedService, { strict: true });

  try {
    await seedService.reset();
    console.log('\n✅ Database reset and seeding completed successfully!');
  } catch (error) {
    console.error('\n❌ Error during reset:', error);
    process.exit(1);
  } finally {
    await app.close();
  }
}

bootstrap();
