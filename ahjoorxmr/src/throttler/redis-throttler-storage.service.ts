import { Injectable } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { RedisService } from '../common/redis/redis.service';

/**
 * Redis-backed throttler storage shared across all pods.
 *
 * Key format:  throttle:<fingerprint>:<throttlerName>
 * Fingerprint: sha256(ip + ":" + userAgent) — prevents trivial bypass by
 *              cycling IPs or user-agents alone.
 *
 * Algorithm is selected via THROTTLE_ALGORITHM env var:
 *   sliding_window  — precise per-request sliding window (default)
 *   fixed_window    — cheaper fixed-window counter
 */
@Injectable()
export class RedisThrottlerStorageService implements ThrottlerStorage {
  private readonly algorithm: 'sliding_window' | 'fixed_window';

  constructor(private readonly redisService: RedisService) {
    const algo = process.env.THROTTLE_ALGORITHM ?? 'sliding_window';
    this.algorithm =
      algo === 'fixed_window' ? 'fixed_window' : 'sliding_window';
  }

  async increment(
    key: string,
    ttl: number,
  ): Promise<{ totalHits: number; timeToExpire: number }> {
    return this.algorithm === 'sliding_window'
      ? this.slidingWindow(key, ttl)
      : this.fixedWindow(key, ttl);
  }

  // ── Sliding window ──────────────────────────────────────────────────────────

  private async slidingWindow(
    key: string,
    ttl: number,
  ): Promise<{ totalHits: number; timeToExpire: number }> {
    const redis = this.redisService.getClient();
    const redisKey = `throttle:sw:${key}`;
    const now = Date.now();
    const windowStart = now - ttl;
    const member = `${now}-${Math.random()}`;

    const multi = redis.multi();
    multi.zremrangebyscore(redisKey, '-inf', windowStart); // evict old entries
    multi.zadd(redisKey, now, member);                     // add current request
    multi.zcard(redisKey);                                 // count in window
    multi.pexpire(redisKey, ttl);                          // reset TTL

    const results = await multi.exec();
    if (!results) throw new Error('Redis transaction failed');

    const totalHits = results[2][1] as number;
    return { totalHits, timeToExpire: ttl };
  }

  // ── Fixed window ────────────────────────────────────────────────────────────

  private async fixedWindow(
    key: string,
    ttl: number,
  ): Promise<{ totalHits: number; timeToExpire: number }> {
    const redis = this.redisService.getClient();
    const redisKey = `throttle:fw:${key}`;

    const multi = redis.multi();
    multi.incr(redisKey);
    multi.pexpire(redisKey, ttl);
    multi.pttl(redisKey);

    const results = await multi.exec();
    if (!results) throw new Error('Redis transaction failed');

    const totalHits = results[0][1] as number;
    const pttl = results[2][1] as number;
    return { totalHits, timeToExpire: pttl > 0 ? pttl : ttl };
  }
}
