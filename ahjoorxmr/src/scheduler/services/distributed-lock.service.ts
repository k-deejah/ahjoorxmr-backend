import { Injectable, Logger } from '@nestjs/common';
import { RedisService } from '../../common/redis/redis.service';

@Injectable()
export class DistributedLockService {
  private readonly logger = new Logger(DistributedLockService.name);
  private readonly lockPrefix = 'scheduler:lock:';
  private readonly defaultTTL = 300; // 5 minutes

  constructor(private readonly redisService: RedisService) {}

  /**
   * Acquire a distributed lock using Redis SET NX (set if not exists)
   * Returns true if lock was acquired, false otherwise
   */
  async acquireLock(
    lockName: string,
    ttlSeconds: number = this.defaultTTL,
  ): Promise<boolean> {
    const lockKey = `${this.lockPrefix}${lockName}`;
    const lockValue = `${Date.now()}`;

    try {
      // Use SET with NX (only set if not exists) and EX (expiration)
      await this.redisService.set(lockKey, lockValue, ttlSeconds);

      // Check if we successfully set the key
      const exists = await this.redisService.exists(lockKey);

      if (exists) {
        this.logger.debug(`Lock acquired: ${lockName}`);
        return true;
      }

      return false;
    } catch (error) {
      this.logger.error(`Failed to acquire lock ${lockName}:`, error);
      return false;
    }
  }

  /**
   * Release a distributed lock
   */
  async releaseLock(lockName: string): Promise<void> {
    const lockKey = `${this.lockPrefix}${lockName}`;

    try {
      await this.redisService.del(lockKey);
      this.logger.debug(`Lock released: ${lockName}`);
    } catch (error) {
      this.logger.error(`Failed to release lock ${lockName}:`, error);
    }
  }

  /**
   * Execute a function with a distributed lock
   * Automatically acquires and releases the lock
   */
  async withLock<T>(
    lockName: string,
    fn: () => Promise<T>,
    ttlSeconds: number = this.defaultTTL,
  ): Promise<T | null> {
    const acquired = await this.acquireLock(lockName, ttlSeconds);

    if (!acquired) {
      this.logger.warn(`Could not acquire lock: ${lockName}. Task skipped.`);
      return null;
    }

    try {
      return await fn();
    } finally {
      await this.releaseLock(lockName);
    }
  }
}
