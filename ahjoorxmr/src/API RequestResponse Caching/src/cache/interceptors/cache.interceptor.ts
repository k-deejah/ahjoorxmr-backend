import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable, of, tap } from 'rxjs';
import { CacheService } from '../cache.service';
import {
  CACHE_KEY_METADATA,
  CACHE_TTL_METADATA,
} from '../decorators/cacheable.decorator';

@Injectable()
export class CacheInterceptor implements NestInterceptor {
  constructor(
    private readonly cacheService: CacheService,
    private readonly reflector: Reflector,
  ) {}

  async intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest();
    const response = context.switchToHttp().getResponse();

    // Only cache GET requests
    if (request.method !== 'GET') {
      return next.handle();
    }

    const keyPrefix = this.reflector.get<string>(
      CACHE_KEY_METADATA,
      context.getHandler(),
    );

    const ttl = this.reflector.get<number>(
      CACHE_TTL_METADATA,
      context.getHandler(),
    );

    if (!keyPrefix) {
      return next.handle();
    }

    // Build cache key with user context
    const userId = request.user?.id || 'anonymous';
    const cacheKey = `${keyPrefix}:${userId}:${request.url}`;

    // Try to get from cache
    const cachedData = await this.cacheService.get(cacheKey);

    if (cachedData) {
      // Set Cache-Control headers
      response.setHeader('X-Cache', 'HIT');
      response.setHeader('Cache-Control', `public, max-age=${ttl || 300}`);
      return of(cachedData);
    }

    // Cache miss - execute handler and cache result
    response.setHeader('X-Cache', 'MISS');
    response.setHeader('Cache-Control', `public, max-age=${ttl || 300}`);

    return next.handle().pipe(
      tap(async (data) => {
        await this.cacheService.set(cacheKey, data, ttl);
      }),
    );
  }
}
