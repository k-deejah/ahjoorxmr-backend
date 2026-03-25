import {
  Injectable,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { ThrottlerGuard, ThrottlerException } from '@nestjs/throttler';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { TrustedIpService } from '../services/trusted-ip.service';
import {
  THROTTLE_SKIP_KEY,
  THROTTLE_CONFIG_KEY,
  THROTTLE_BYPASS_KEY,
  RateLimitConfig,
} from '../decorators/rate-limit.decorator';

/**
 * Enhanced throttler guard with IP-based rate limiting,
 * trusted IP bypass, and custom rate limit configurations
 */
@Injectable()
export class CustomThrottlerGuard extends ThrottlerGuard {
  private readonly logger = new Logger(CustomThrottlerGuard.name);

  constructor(
    options: any,
    private readonly trustedIpService: TrustedIpService,
    protected readonly reflector: Reflector,
  ) {
    super(options, null as any, reflector);
  }

  /**
   * Main guard logic with trusted IP bypass and IP blocking checks
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    // Check if rate limiting should be skipped for this endpoint
    const skipRateLimit = this.reflector.getAllAndOverride<boolean>(
      THROTTLE_SKIP_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (skipRateLimit) {
      this.logger.debug(`Rate limiting skipped for ${request.path}`);
      return true;
    }

    // Extract IP address
    const ip = this.extractIp(request);
    this.logger.debug(`Request from IP: ${ip} to ${request.path}`);

    // Check if IP is blocked
    const blockStatus = await this.trustedIpService.isIpBlocked(ip);
    if (blockStatus.blocked) {
      this.logger.warn(`Blocked IP ${ip} attempted to access ${request.path}`);
      throw new HttpException(
        {
          statusCode: HttpStatus.FORBIDDEN,
          message: `Access denied: ${blockStatus.reason}`,
          error: 'Forbidden',
          blockedUntil: await this.getBlockExpiry(ip),
        },
        HttpStatus.FORBIDDEN,
      );
    }

    // Check if IP is trusted and bypass is allowed
    const allowBypass = this.reflector.getAllAndOverride<boolean>(
      THROTTLE_BYPASS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (allowBypass && this.trustedIpService.isTrustedIp(ip)) {
      this.logger.log(
        `Trusted IP ${ip} bypassing rate limit for ${request.path}`,
      );
      return true;
    }

    // Get custom rate limit configuration for this endpoint
    const customConfig = this.reflector.getAllAndOverride<RateLimitConfig>(
      THROTTLE_CONFIG_KEY,
      [context.getHandler(), context.getClass()],
    );

    // Store rate limit config in request for later use
    if (customConfig) {
      (request as any).rateLimitConfig = customConfig;
    }

    try {
      // Execute parent throttler logic
      const canActivate = await super.canActivate(context);
      return canActivate;
    } catch (error) {
      // Handle rate limit exceeded
      if (error instanceof ThrottlerException) {
        // Increment violation counter
        const { count, shouldBlock } =
          await this.trustedIpService.incrementViolations(ip);

        this.logger.warn(
          `Rate limit exceeded for IP ${ip} on ${request.path} (${count} violations)`,
        );

        // If violations exceed threshold, IP will be blocked
        if (shouldBlock) {
          throw new HttpException(
            {
              statusCode: HttpStatus.FORBIDDEN,
              message:
                'Too many rate limit violations. Your IP has been temporarily blocked.',
              error: 'Forbidden',
              violations: count,
            },
            HttpStatus.FORBIDDEN,
          );
        }

        // Throw custom message if configured
        const customMessage = customConfig?.message;
        if (customMessage) {
          throw new HttpException(
            {
              statusCode: HttpStatus.TOO_MANY_REQUESTS,
              message: customMessage,
              error: 'Too Many Requests',
              retryAfter: customConfig?.ttl
                ? Math.ceil(customConfig.ttl / 1000)
                : 60,
            },
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }

        // Re-throw original exception
        throw error;
      }

      throw error;
    }
  }

  /**
   * Extract IP address from request with proxy support
   */
  protected extractIp(req: Request): string {
    // Check X-Forwarded-For header (proxy/load balancer)
    const forwardedFor = req.headers['x-forwarded-for'];
    if (forwardedFor) {
      const ips = (forwardedFor as string).split(',').map((ip) => ip.trim());
      return ips[0]; // Use the first IP (client's real IP)
    }

    // Check X-Real-IP header (nginx)
    const realIp = req.headers['x-real-ip'];
    if (realIp) {
      return realIp as string;
    }

    // Check CF-Connecting-IP (Cloudflare)
    const cfIp = req.headers['cf-connecting-ip'];
    if (cfIp) {
      return cfIp as string;
    }

    // Fall back to socket IP
    return req.ip || req.socket?.remoteAddress || 'unknown';
  }

  /**
   * Get tracker key for rate limiting
   * Uses user ID for authenticated requests, IP for anonymous
   */
  protected async getTracker(req: Request): Promise<string> {
    const user = (req as any).user;

    // Use user ID if authenticated
    if (user && user.id) {
      return `user:${user.id}`;
    }

    // Use IP address for anonymous requests
    const ip = this.extractIp(req);
    return `ip:${ip}`;
  }

  /**
   * Get throttler limit based on custom config, user authentication, or defaults
   */
  protected getThrottlerLimit(context: ExecutionContext): number {
    const request = context.switchToHttp().getRequest();

    // Check for custom configuration
    const customConfig = this.reflector.getAllAndOverride<RateLimitConfig>(
      THROTTLE_CONFIG_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (customConfig) {
      return customConfig.limit;
    }

    // Check if user is authenticated
    const user = request.user;
    if (user && user.id) {
      return 200; // Higher limit for authenticated users
    }

    return 100; // Default limit for anonymous users
  }

  /**
   * Get throttler TTL based on custom config or defaults
   */
  protected getThrottlerTtl(context: ExecutionContext): number {
    const customConfig = this.reflector.getAllAndOverride<RateLimitConfig>(
      THROTTLE_CONFIG_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (customConfig) {
      return customConfig.ttl;
    }

    return 60000; // Default: 1 minute
  }

  /**
   * Get block expiry timestamp for blocked IP
   */
  private async getBlockExpiry(ip: string): Promise<number> {
    // This would need Redis TTL check - simplified here
    return Date.now() + 3600000; // 1 hour default
  }
}
