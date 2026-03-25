import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable, of } from 'rxjs';
import { tap, switchMap } from 'rxjs/operators';
import { Reflector } from '@nestjs/core';
import { RedisService } from '../redis/redis.service';

export const CACHE_TTL_KEY = 'cache_ttl';

/**
 * Custom decorator to set cache TTL for a specific route handler.
 * Usage: @CacheTTL(60) for 60 seconds TTL
 */
export function CacheTTL(seconds: number) {
  return (
    target: unknown,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ) => {
    Reflect.defineMetadata(CACHE_TTL_KEY, seconds, descriptor.value);
    return descriptor;
  };
}

/**
 * CacheInterceptor caches GET responses using Redis.
 * The TTL is configurable via the @CacheTTL() decorator at route level.
 * If no TTL is specified, default is 300 seconds (5 minutes).
 */
@Injectable()
export class CacheInterceptor implements NestInterceptor {
  private readonly logger = new Logger(CacheInterceptor.name);
  private readonly DEFAULT_TTL = 300; // 5 minutes default

  constructor(
    private readonly reflector: Reflector,
    private readonly redisService: RedisService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();

    // Only cache GET requests
    if (request.method !== 'GET') {
      return next.handle();
    }

    // Get TTL from decorator or use default
    const handler = context.getHandler();
    const ttl = Reflect.getMetadata(CACHE_TTL_KEY, handler) || this.DEFAULT_TTL;

    // Generate cache key from request URL and query params
    const cacheKey = this.generateCacheKey(request);

    // Try to get from cache first - use switchMap to properly handle async
    return this.getFromCache(cacheKey).pipe(
      switchMap((cachedResponse) => {
        if (cachedResponse !== null) {
          this.logger.debug(`Cache HIT for key: ${cacheKey}`);
          return of(cachedResponse);
        }

        // Cache miss - proceed to handler and cache the response
        this.logger.debug(`Cache MISS for key: ${cacheKey}`);
        return next.handle().pipe(
          tap((data) => {
            // Cache the response with TTL
            this.redisService.set(cacheKey, data, ttl).then(() => {
              this.logger.debug(
                `Cached response for key: ${cacheKey} with TTL: ${ttl}s`,
              );
            });
          }),
        );
      }),
    );
  }

  private getFromCache(cacheKey: string): Observable<unknown | null> {
    return new Observable((subscriber) => {
      this.redisService
        .get(cacheKey)
        .then((value) => {
          subscriber.next(value);
          subscriber.complete();
        })
        .catch((err) => {
          this.logger.error(`Cache get error: ${err.message}`);
          subscriber.next(null);
          subscriber.complete();
        });
    });
  }

  /**
   * Generate a unique cache key from the request URL and query parameters.
   */
  private generateCacheKey(request: {
    url: string;
    query: Record<string, unknown>;
  }): string {
    const baseUrl = request.url.split('?')[0];
    const queryString = Object.keys(request.query)
      .sort()
      .map((key) => `${key}=${request.query[key]}`)
      .join('&');

    return `cache:${baseUrl}${queryString ? `?${queryString}` : ''}`;
  }
}

/**
 * Cache invalidation utility for when data mutations occur.
 * Call these methods when groups, users, or other cached data are updated.
 */
@Injectable()
export class CacheInvalidator {
  private readonly logger = new Logger(CacheInvalidator.name);
  private readonly redisService: RedisService;

  constructor(redisService: RedisService) {
    this.redisService = redisService;
  }

  /**
   * Invalidate all cache entries for a specific route pattern.
   * Useful for invalidating user or group related caches.
   */
  async invalidatePattern(pattern: string): Promise<number> {
    const count = await this.redisService.delByPattern(`cache:*${pattern}*`);
    this.logger.log(`Invalidated ${count} cache entries matching: ${pattern}`);
    return count;
  }

  /**
   * Invalidate all cached data when a group is updated.
   */
  async invalidateGroupCache(groupId: string): Promise<number> {
    return this.invalidatePattern(`/groups/${groupId}`);
  }

  /**
   * Invalidate all cached data when a user is updated.
   */
  async invalidateUserCache(userId: string): Promise<number> {
    return this.invalidatePattern(`/users/${userId}`);
  }

  /**
   * Invalidate all caches (useful for system-wide refresh).
   */
  async invalidateAll(): Promise<number> {
    return this.invalidatePattern('*');
  }
}
