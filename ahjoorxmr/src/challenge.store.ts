import { Injectable, Logger } from '@nestjs/common';

interface ChallengeRecord {
  challenge: string;
  expiresAt: number;
}

/**
 * Ephemeral in-memory store for Stellar challenge strings.
 *
 * For multi-instance deployments, swap this for a Redis-backed
 * implementation (e.g. using ioredis with NX + EX flags).
 */
@Injectable()
export class ChallengeStore {
  private readonly logger = new Logger(ChallengeStore.name);
  private readonly store = new Map<string, ChallengeRecord>();

  /** TTL in milliseconds (default: 5 minutes) */
  private readonly TTL_MS = 5 * 60 * 1_000;

  set(walletAddress: string, challenge: string): void {
    this.store.set(walletAddress, {
      challenge,
      expiresAt: Date.now() + this.TTL_MS,
    });
  }

  /**
   * Returns the challenge for the given wallet address if it exists
   * and has not expired. Consuming the challenge deletes it (one-time use).
   */
  consume(walletAddress: string, challenge: string): boolean {
    const record = this.store.get(walletAddress);

    if (!record) {
      this.logger.debug(`No challenge found for ${walletAddress}`);
      return false;
    }

    if (Date.now() > record.expiresAt) {
      this.store.delete(walletAddress);
      this.logger.debug(`Challenge expired for ${walletAddress}`);
      return false;
    }

    if (record.challenge !== challenge) {
      this.logger.debug(`Challenge mismatch for ${walletAddress}`);
      return false;
    }

    // One-time use — delete after successful consumption
    this.store.delete(walletAddress);
    return true;
  }

  has(walletAddress: string): boolean {
    const record = this.store.get(walletAddress);
    if (!record) return false;
    if (Date.now() > record.expiresAt) {
      this.store.delete(walletAddress);
      return false;
    }
    return true;
  }

  /** Periodic cleanup — call from a NestJS scheduled task if desired */
  purgeExpired(): number {
    const now = Date.now();
    let count = 0;
    for (const [key, record] of this.store.entries()) {
      if (now > record.expiresAt) {
        this.store.delete(key);
        count++;
      }
    }
    return count;
  }
}
