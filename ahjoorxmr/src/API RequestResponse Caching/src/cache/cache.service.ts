import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Cache } from 'cache-manager';

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  async get<T>(key: string): Promise<T | undefined> {
    const value = await this.cacheManager.get<T>(key);
    if (value) {
      this.logger.log(`Cache HIT for key: ${key}`);
    } else {
      this.logger.log(`Cache MISS for key: ${key}`);
    }
    return value;
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    await this.cacheManager.set(key, value, ttl);
    this.logger.log(`Cache SET for key: ${key}, TTL: ${ttl || 'default'}`);
  }

  async del(key: string): Promise<void> {
    await this.cacheManager.del(key);
    this.logger.log(`Cache INVALIDATED for key: ${key}`);
  }

  async delPattern(pattern: string): Promise<void> {
    // For Redis store, we need to get all keys matching pattern and delete them
    const store = this.cacheManager.store as any;
    if (store.keys) {
      const keys = await store.keys(pattern);
      await Promise.all(keys.map((key: string) => this.del(key)));
      this.logger.log(
        `Cache INVALIDATED for pattern: ${pattern}, keys: ${keys.length}`,
      );
    }
  }

  async reset(): Promise<void> {
    await this.cacheManager.reset();
    this.logger.log('Cache RESET - all keys cleared');
  }
}
