import { Injectable, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

/**
 * RedisService provides a typed interface for Redis operations.
 * It wraps ioredis and exposes clean methods for caching and session management.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  private readonly client: Redis;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('REDIS_HOST', 'localhost');
    const port = this.configService.get<number>('REDIS_PORT', 6379);
    const password = this.configService.get<string>('REDIS_PASSWORD');

    this.client = new Redis({
      host,
      port,
      password: password || undefined,
      lazyConnect: true,
      retryStrategy: (times) => {
        const delay = Math.min(times * 50, 2000);
        return delay;
      },
    });
    this.redis.on('connect', () => {
      this.logger.log(`Connected to Redis at ${host}:${port}`);
    });

    this.redis.on('error', (err) => {
      this.logger.error(`Redis connection error: ${err.message}`);
    });
  }

  async onModuleDestroy() {
    await this.redis.quit();
  }

  /**
   * Get a value from Redis by key
   * @param key - The Redis key
   * @returns The stored value or null if not found
   */
  async get(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key);
    } catch (error) {
      this.logger.error(`Error getting key ${key}: ${error}`);
      return null;
    }
  }

  /**
   * Set a value in Redis
   * @param key - The Redis key
   * @param value - The value to store
   * @returns 'OK' if successful
   */
  async set(key: string, value: string): Promise<'OK' | null> {
    try {
      return await this.redis.set(key, value);
    } catch (error) {
      this.logger.error(`Error setting key ${key}: ${error}`);
      return null;
    }
  }

  /**
   * Set a value in Redis with expiration time
   * @param key - The Redis key
   * @param value - The value to store
   * @param ttlSeconds - Time to live in seconds
   * @returns 'OK' if successful
   */
  async setWithExpiry(
    key: string,
    value: string,
    ttlSeconds: number,
  ): Promise<'OK' | null> {
    try {
      return await this.redis.set(key, value, 'EX', ttlSeconds);
    } catch (error) {
      this.logger.error(`Error setting key ${key} with expiry: ${error}`);
      return null;
    }
  }

  /**
   * Delete a key from Redis
   * @param key - The Redis key to delete
   * @returns Number of keys deleted
   */
  async del(key: string): Promise<number> {
    try {
      return await this.redis.del(key);
    } catch (error) {
      this.logger.error(`Error deleting key ${key}: ${error}`);
      return 0;
    }
  }

  /**
   * Check if a key exists in Redis
   * @param key - The Redis key
   * @returns 1 if exists, 0 otherwise
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error(`Error checking key ${key}: ${error}`);
      return false;
    }
  }

  /**
   * Get the underlying Redis client for advanced operations
   */
  getClient(): Redis {
    return this.redis;

    this.client.on('connect', () => {
      this.logger.log(`Connected to Redis at ${host}:${port}`);
    });

    this.client.on('error', (err) => {
      this.logger.error('Redis connection error:', err);
    });
  }

  /**
   * Get a value from Redis by key.
   */
  async get<T = string>(key: string): Promise<T | null> {
    const value = await this.client.get(key);
    if (value === null) {
      return null;
    }
    try {
      return JSON.parse(value) as T;
    } catch {
      return value as T;
    }
  }

  /**
   * Set a value in Redis with optional expiration.
   */
  async set(key: string, value: unknown, ttlSeconds?: number): Promise<void> {
    const serialized =
      typeof value === 'string' ? value : JSON.stringify(value);
    if (ttlSeconds) {
      await this.client.set(key, serialized, 'EX', ttlSeconds);
    } else {
      await this.client.set(key, serialized);
    }
  }

  /**
   * Set a value in Redis with a specific expiration time (TTL).
   * This is useful for short-lived data like authentication challenges.
   */
  async setWithExpiry(
    key: string,
    value: unknown,
    ttlSeconds: number,
  ): Promise<void> {
    const serialized =
      typeof value === 'string' ? value : JSON.stringify(value);
    await this.client.set(key, serialized, 'EX', ttlSeconds);
    this.logger.debug(`Set key ${key} with TTL ${ttlSeconds}s`);
  }

  /**
   * Delete a key from Redis.
   */
  async del(key: string): Promise<number> {
    return await this.client.del(key);
  }

  /**
   * Delete multiple keys from Redis using a pattern.
   * Useful for cache invalidation (e.g., deleting all keys matching "user:1:*")
   */
  async delByPattern(pattern: string): Promise<number> {
    let cursor = '0';
    let deletedCount = 0;

    do {
      const [nextCursor, keys] = await this.client.scan(
        cursor,
        'MATCH',
        pattern,
        'COUNT',
        100,
      );
      cursor = nextCursor;

      if (keys.length > 0) {
        deletedCount += await this.client.del(...keys);
      }
    } while (cursor !== '0');

    if (deletedCount > 0) {
      this.logger.debug(
        `Deleted ${deletedCount} keys matching pattern: ${pattern}`,
      );
    }

    return deletedCount;
  }

  /**
   * Check if a key exists in Redis.
   */
  async exists(key: string): Promise<boolean> {
    const result = await this.client.exists(key);
    return result === 1;
  }

  /**
   * Set expiration time on an existing key.
   */
  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    return (await this.client.expire(key, ttlSeconds)) === 1;
  }

  /**
   * Get the remaining time-to-live (TTL) of a key.
   */
  async ttl(key: string): Promise<number> {
    return await this.client.ttl(key);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.quit();
  }
}
