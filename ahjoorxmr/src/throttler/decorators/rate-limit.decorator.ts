import { SetMetadata } from '@nestjs/common';

/**
 * Metadata keys for throttle configuration
 */
export const THROTTLE_SKIP_KEY = 'throttler:skip';
export const THROTTLE_CONFIG_KEY = 'throttler:config';
export const THROTTLE_BYPASS_KEY = 'throttler:bypass';

/**
 * Rate limit configuration for different endpoint types
 */
export interface RateLimitConfig {
  /** Time window in milliseconds */
  ttl: number;
  /** Maximum number of requests in the time window */
  limit: number;
  /** Optional custom message when limit is exceeded */
  message?: string;
  /** Block user completely after exceeding limit */
  blockDuration?: number;
}

/**
 * Predefined rate limit configurations for common scenarios
 */
export const RateLimitPresets = {
  /** Very strict: 3 requests per 5 minutes (password reset, account deletion) */
  VERY_STRICT: { ttl: 300000, limit: 3 } as RateLimitConfig,

  /** Strict: 5 requests per minute (login, registration, 2FA) */
  STRICT: { ttl: 60000, limit: 5 } as RateLimitConfig,

  /** Moderate: 20 requests per minute (sensitive operations) */
  MODERATE: { ttl: 60000, limit: 20 } as RateLimitConfig,

  /** Default: 100 requests per minute (general endpoints) */
  DEFAULT: { ttl: 60000, limit: 100 } as RateLimitConfig,

  /** Lenient: 200 requests per minute (authenticated users) */
  LENIENT: { ttl: 60000, limit: 200 } as RateLimitConfig,

  /** Public: 500 requests per minute (public data endpoints) */
  PUBLIC: { ttl: 60000, limit: 500 } as RateLimitConfig,

  /** Burst protection: 10 requests per second */
  BURST: { ttl: 1000, limit: 10 } as RateLimitConfig,
};

/**
 * Custom decorator to set rate limits for specific endpoints
 *
 * @example
 * ```typescript
 * @ApiRateLimit(RateLimitPresets.STRICT)
 * @Post('login')
 * async login() { }
 *
 * @ApiRateLimit({ ttl: 60000, limit: 5, message: 'Too many login attempts' })
 * @Post('login')
 * async login() { }
 * ```
 */
export const ApiRateLimit = (config: RateLimitConfig) =>
  SetMetadata(THROTTLE_CONFIG_KEY, config);

/**
 * Decorator to skip rate limiting for specific endpoints
 * Use for health checks, metrics, or trusted internal endpoints
 *
 * @example
 * ```typescript
 * @SkipRateLimit()
 * @Get('health')
 * health() { }
 * ```
 */
export const SkipRateLimit = () => SetMetadata(THROTTLE_SKIP_KEY, true);

/**
 * Decorator to allow bypassing rate limits for trusted IPs
 * Should be used sparingly and with caution
 *
 * @example
 * ```typescript
 * @AllowBypass()
 * @Get('internal-api')
 * internalApi() { }
 * ```
 */
export const AllowBypass = () => SetMetadata(THROTTLE_BYPASS_KEY, true);

/**
 * Composite decorator for authentication endpoints
 * Applies strict rate limiting (5 req/min) with custom message
 *
 * @example
 * ```typescript
 * @AuthRateLimit()
 * @Post('login')
 * async login() { }
 * ```
 */
export const AuthRateLimit = () =>
  ApiRateLimit({
    ...RateLimitPresets.STRICT,
    message: 'Too many authentication attempts. Please try again later.',
    blockDuration: 900000, // 15 minutes block after exceeding
  });

/**
 * Composite decorator for public endpoints
 * Applies lenient rate limiting (500 req/min)
 *
 * @example
 * ```typescript
 * @PublicRateLimit()
 * @Get('public-data')
 * async getPublicData() { }
 * ```
 */
export const PublicRateLimit = () => ApiRateLimit(RateLimitPresets.PUBLIC);
