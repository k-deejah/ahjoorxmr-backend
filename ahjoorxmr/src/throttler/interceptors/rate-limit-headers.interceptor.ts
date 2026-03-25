import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  Logger,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Response, Request } from 'express';
import { Reflector } from '@nestjs/core';
import {
  THROTTLE_CONFIG_KEY,
  RateLimitConfig,
} from '../decorators/rate-limit.decorator';

/**
 * Interceptor to add comprehensive rate limit headers to responses
 * Follows RFC 6585 and draft standards for rate limit headers
 */
@Injectable()
export class RateLimitHeadersInterceptor implements NestInterceptor {
  private readonly logger = new Logger(RateLimitHeadersInterceptor.name);

  constructor(private readonly reflector: Reflector) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const response = context.switchToHttp().getResponse<Response>();
    const request = context.switchToHttp().getRequest<Request>();
    const handler = context.getHandler();
    const controller = context.getClass();

    // Get custom rate limit configuration if exists
    const customConfig = this.reflector.getAllAndOverride<RateLimitConfig>(
      THROTTLE_CONFIG_KEY,
      [handler, controller],
    );

    return next.handle().pipe(
      tap(() => {
        try {
          // Get rate limit info from request (set by throttler guard)
          const rateLimitInfo = (request as any).rateLimit;

          // Determine limit and TTL
          let limit = 100; // default
          let ttl = 60000; // default 1 minute

          if (customConfig) {
            limit = customConfig.limit;
            ttl = customConfig.ttl;
          } else if (rateLimitInfo) {
            limit = rateLimitInfo.limit || limit;
            ttl = rateLimitInfo.ttl || ttl;
          }

          // Calculate remaining requests
          const current = rateLimitInfo?.current || 0;
          const remaining = Math.max(0, limit - current);

          // Calculate reset time
          const resetTime = rateLimitInfo?.resetTime || Date.now() + ttl;
          const resetSeconds = Math.ceil((resetTime - Date.now()) / 1000);

          // Standard rate limit headers (widely supported)
          response.setHeader('X-RateLimit-Limit', limit.toString());
          response.setHeader('X-RateLimit-Remaining', remaining.toString());
          response.setHeader(
            'X-RateLimit-Reset',
            Math.floor(resetTime / 1000).toString(),
          );

          // Additional informational headers
          response.setHeader(
            'X-RateLimit-Reset-After',
            Math.max(0, resetSeconds).toString(),
          );
          response.setHeader('X-RateLimit-Window', (ttl / 1000).toString());

          // Draft standard headers (RateLimit-* format)
          // See: https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/
          response.setHeader('RateLimit-Limit', limit.toString());
          response.setHeader('RateLimit-Remaining', remaining.toString());
          response.setHeader(
            'RateLimit-Reset',
            Math.max(0, resetSeconds).toString(),
          );

          // Policy header describing the rate limit policy
          response.setHeader(
            'RateLimit-Policy',
            `${limit};w=${Math.floor(ttl / 1000)}`,
          );

          // Add retry-after header if nearing limit
          if (remaining === 0) {
            response.setHeader(
              'Retry-After',
              Math.max(0, resetSeconds).toString(),
            );
          }

          this.logger.debug(
            `Rate limit headers added: ${remaining}/${limit} remaining, resets in ${resetSeconds}s`,
          );
        } catch (error) {
          // Log error but don't fail the request
          this.logger.error('Error adding rate limit headers', error);
        }
      }),
    );
  }
}
