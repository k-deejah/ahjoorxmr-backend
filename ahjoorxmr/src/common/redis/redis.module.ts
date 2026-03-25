import { Module, Global } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { RedisService } from './redis.service';

/**
 * RedisModule provides Redis caching capabilities throughout the application.
 * It is marked as global so RedisService can be injected anywhere without
 * re-importing the module.
 */
@Global()
@Module({
  imports: [ConfigModule],
  providers: [RedisService],
  exports: [RedisService],
})
export class RedisModule {}
