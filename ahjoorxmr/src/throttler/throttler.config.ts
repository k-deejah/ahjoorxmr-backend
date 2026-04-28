import { ThrottlerModuleOptions } from '@nestjs/throttler';

/**
 * Throttler configuration with multiple named throttlers
 * for different rate limiting strategies
 */
export const throttlerConfig: ThrottlerModuleOptions = {
  throttlers: [
    {
      name: 'default',
      ttl: parseInt(process.env.THROTTLE_TTL || '60000', 10),
      limit: parseInt(process.env.THROTTLE_LIMIT || '100', 10),
    },
    {
      name: 'authenticated',
      ttl: parseInt(process.env.THROTTLE_TTL_AUTHENTICATED || '60000', 10),
      limit: parseInt(process.env.THROTTLE_LIMIT_AUTHENTICATED || '200', 10),
    },
    {
      // Stricter named throttler for auth endpoints (#182)
      name: 'auth',
      ttl: parseInt(process.env.AUTH_LOGIN_TTL || '60000', 10),
      limit: parseInt(process.env.AUTH_LOGIN_LIMIT || '10', 10),
    },
    {
      name: 'short',
      ttl: 1000,
      limit: 10,
    },
    {
      name: 'strict',
      ttl: 60000,
      limit: 5,
    },
    {
      name: 'public',
      ttl: 60000,
      limit: 500,
    },
  ],
  // Error message customization
  errorMessage: 'Too Many Requests',

  // Skip successful requests in counting (optional)
  skipSuccessfulRequests: false,

  // Skip failed requests in counting (optional)
  skipFailedRequests: false,

  // Ignore user agents (bots, health checks, etc.)
  ignoreUserAgents: [
    /googlebot/i,
    /bingbot/i,
    /slackbot/i,
    /twitterbot/i,
    /facebookexternalhit/i,
    /linkedinbot/i,
    /kube-probe/i, // Kubernetes health checks
    /pingdom/i,
    /uptimerobot/i,
  ],
};

/**
 * Get throttler config for specific environment
 */
export function getThrottlerConfig(): ThrottlerModuleOptions {
  const env = process.env.NODE_ENV || 'development';

  // More lenient in development
  if (env === 'development') {
    return {
      ...throttlerConfig,
      throttlers: throttlerConfig.throttlers.map((t) => ({
        ...t,
        limit: t.limit * 2, // Double limits in development
      })),
    };
  }

  // Stricter in production
  if (env === 'production') {
    return {
      ...throttlerConfig,
      skipFailedRequests: false, // Count all requests in production
      skipSuccessfulRequests: false,
    };
  }

  return throttlerConfig;
}
