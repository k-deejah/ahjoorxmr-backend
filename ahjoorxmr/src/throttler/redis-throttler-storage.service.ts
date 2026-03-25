import { Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

@Injectable()
export class RedisThrottlerStorageService implements ThrottlerStorage {
  constructor(@InjectRedis() private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
  ): Promise<{
    totalHits: number;
    timeToExpire: number;
  }> {
    const redisKey = `throttle:${key}`;
    const multi = this.redis.multi();

    multi.incr(redisKey);
    multi.pexpire(redisKey, ttl);
    multi.pttl(redisKey);

    const results = await multi.exec();

    if (!results) {
      throw new Error('Redis transaction failed');
    }

    const totalHits = results[0][1] as number;
    const timeToExpire = results[2][1] as number;

    return {
      totalHits,
      timeToExpire: timeToExpire > 0 ? timeToExpire : ttl,
    };
  }
}
