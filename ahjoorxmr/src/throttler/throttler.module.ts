import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { APP_GUARD } from '@nestjs/core';
import { RedisModule } from '../common/redis/redis.module';
import { RedisThrottlerStorageService } from './redis-throttler-storage.service';
import { getThrottlerConfig } from './throttler.config';
import { TrustedIpService } from './services/trusted-ip.service';
import { CustomThrottlerGuard } from './guards/custom-throttler.guard';
import { RateLimitAdminController } from './controllers/rate-limit-admin.controller';
import { RateLimitExampleController } from './controllers/rate-limit-example.controller';

/**
 * Custom throttler module with Redis storage and advanced features
 * - Redis-based distributed rate limiting
 * - Trusted IP bypass mechanism
 * - IP blocking for repeated violations
 * - Configurable rate limits per endpoint
 * - Admin API for managing blocked/trusted IPs
 * - Example endpoints demonstrating usage
 */
@Module({
  imports: [
    ThrottlerModule.forRoot({
      ...getThrottlerConfig(),
      storage: RedisThrottlerStorageService,
    }),
    RedisModule,
  ],
  controllers: [RateLimitAdminController, RateLimitExampleController],
  providers: [
    RedisThrottlerStorageService,
    TrustedIpService,
    {
      provide: APP_GUARD,
      useClass: CustomThrottlerGuard,
    },
  ],
  exports: [ThrottlerModule, RedisThrottlerStorageService, TrustedIpService],
})
export class CustomThrottlerModule {}
