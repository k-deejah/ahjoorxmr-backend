import { Controller, Get, Post, Body } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import {
  ApiRateLimit,
  AuthRateLimit,
  PublicRateLimit,
  SkipRateLimit,
  RateLimitPresets,
} from '../decorators/rate-limit.decorator';

/**
 * Example controller demonstrating various rate limiting strategies
 *
 * This controller shows how to use different rate limiting decorators
 * and presets for different types of endpoints.
 */
@ApiTags('Rate Limiting Examples')
@Controller({ path: 'examples/rate-limit', version: '1' })
export class RateLimitExampleController {
  /**
   * Default rate limiting (100 req/min for anonymous, 200 for authenticated)
   */
  @Get('default')
  @ApiOperation({
    summary: 'Default rate limiting',
    description:
      'Uses global rate limits: 100 req/min anonymous, 200 req/min authenticated',
  })
  @ApiResponse({ status: 200, description: 'Success' })
  @ApiResponse({ status: 429, description: 'Too Many Requests' })
  defaultRateLimit() {
    return {
      message: 'This endpoint uses default rate limiting',
      limits: {
        anonymous: '100 requests per minute',
        authenticated: '200 requests per minute',
      },
    };
  }

  /**
   * Strict rate limiting for authentication (5 req/min)
   */
  @Post('auth/login')
  @AuthRateLimit()
  @ApiOperation({
    summary: 'Strict rate limiting for authentication',
    description: 'Limited to 5 requests per minute with automatic blocking',
  })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({
    status: 429,
    description: 'Too many login attempts',
    schema: {
      example: {
        statusCode: 429,
        message: 'Too many authentication attempts. Please try again later.',
        error: 'Too Many Requests',
        retryAfter: 60,
      },
    },
  })
  strictLogin(@Body() credentials: any) {
    return {
      message: 'Login endpoint with strict rate limiting',
      limits: '5 requests per minute',
    };
  }

  /**
   * Very strict for sensitive operations (3 req/5min)
   */
  @Post('auth/reset-password')
  @ApiRateLimit(RateLimitPresets.VERY_STRICT)
  @ApiOperation({
    summary: 'Very strict rate limiting',
    description: 'Limited to 3 requests per 5 minutes for password reset',
  })
  resetPassword(@Body() data: any) {
    return {
      message: 'Password reset endpoint',
      limits: '3 requests per 5 minutes',
    };
  }

  /**
   * Moderate rate limiting (20 req/min)
   */
  @Post('moderate')
  @ApiRateLimit(RateLimitPresets.MODERATE)
  @ApiOperation({
    summary: 'Moderate rate limiting',
    description: 'Limited to 20 requests per minute',
  })
  moderateAction(@Body() data: any) {
    return {
      message: 'Moderate rate limiting',
      limits: '20 requests per minute',
    };
  }

  /**
   * Public endpoint with lenient limits (500 req/min)
   */
  @Get('public/data')
  @PublicRateLimit()
  @ApiOperation({
    summary: 'Public data endpoint',
    description: 'Lenient rate limiting for public read-only data: 500 req/min',
  })
  publicData() {
    return {
      message: 'Public data with lenient rate limiting',
      limits: '500 requests per minute',
      data: {
        timestamp: Date.now(),
        environment: process.env.NODE_ENV,
      },
    };
  }

  /**
   * Burst protection (10 req/sec)
   */
  @Post('burst-test')
  @ApiRateLimit(RateLimitPresets.BURST)
  @ApiOperation({
    summary: 'Burst protection example',
    description: 'Limited to 10 requests per second to prevent rapid bursts',
  })
  burstTest(@Body() data: any) {
    return {
      message: 'Burst protection enabled',
      limits: '10 requests per second',
    };
  }

  /**
   * Custom rate limit configuration
   */
  @Post('custom')
  @ApiRateLimit({
    ttl: 120000, // 2 minutes
    limit: 15,
    message: 'Custom rate limit exceeded. Please wait 2 minutes.',
    blockDuration: 300000, // Block for 5 minutes if exceeded
  })
  @ApiOperation({
    summary: 'Custom rate limit configuration',
    description: 'Custom limits: 15 requests per 2 minutes',
  })
  customRateLimit(@Body() data: any) {
    return {
      message: 'Custom rate limiting',
      limits: '15 requests per 2 minutes',
      blockDuration: '5 minutes if exceeded',
    };
  }

  /**
   * No rate limiting (health checks, monitoring, etc.)
   */
  @Get('health')
  @SkipRateLimit()
  @ApiOperation({
    summary: 'No rate limiting',
    description: 'This endpoint skips rate limiting entirely',
  })
  health() {
    return {
      status: 'ok',
      message: 'This endpoint has no rate limiting',
    };
  }

  /**
   * Get information about rate limits
   */
  @Get('info')
  @ApiOperation({
    summary: 'Rate limit information',
    description: 'Get information about available rate limit presets',
  })
  @ApiResponse({
    status: 200,
    description: 'Rate limit presets information',
    schema: {
      example: {
        presets: {
          VERY_STRICT: {
            ttl: 300000,
            limit: 3,
            description: 'For password reset, account deletion',
          },
          STRICT: {
            ttl: 60000,
            limit: 5,
            description: 'For authentication endpoints',
          },
          MODERATE: {
            ttl: 60000,
            limit: 20,
            description: 'For sensitive operations',
          },
          DEFAULT: {
            ttl: 60000,
            limit: 100,
            description: 'For general endpoints',
          },
          LENIENT: {
            ttl: 60000,
            limit: 200,
            description: 'For authenticated users',
          },
          PUBLIC: { ttl: 60000, limit: 500, description: 'For public data' },
          BURST: { ttl: 1000, limit: 10, description: 'Burst protection' },
        },
      },
    },
  })
  getRateLimitInfo() {
    return {
      presets: {
        VERY_STRICT: {
          ttl: 300000,
          limit: 3,
          description: 'For password reset, account deletion',
          window: '5 minutes',
        },
        STRICT: {
          ttl: 60000,
          limit: 5,
          description: 'For authentication endpoints',
          window: '1 minute',
        },
        MODERATE: {
          ttl: 60000,
          limit: 20,
          description: 'For sensitive operations',
          window: '1 minute',
        },
        DEFAULT: {
          ttl: 60000,
          limit: 100,
          description: 'For general endpoints',
          window: '1 minute',
        },
        LENIENT: {
          ttl: 60000,
          limit: 200,
          description: 'For authenticated users',
          window: '1 minute',
        },
        PUBLIC: {
          ttl: 60000,
          limit: 500,
          description: 'For public data',
          window: '1 minute',
        },
        BURST: {
          ttl: 1000,
          limit: 10,
          description: 'Burst protection',
          window: '1 second',
        },
      },
      headers: {
        standard: [
          'X-RateLimit-Limit',
          'X-RateLimit-Remaining',
          'X-RateLimit-Reset',
          'X-RateLimit-Reset-After',
          'X-RateLimit-Window',
        ],
        draft: [
          'RateLimit-Limit',
          'RateLimit-Remaining',
          'RateLimit-Reset',
          'RateLimit-Policy',
        ],
      },
    };
  }
}
