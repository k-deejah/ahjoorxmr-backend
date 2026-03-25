import { SetMetadata } from '@nestjs/common';

export const CUSTOM_THROTTLE_KEY = 'custom_throttle';

export interface CustomThrottleOptions {
  limit: number;
  ttl: number;
}

export const CustomThrottle = (options: CustomThrottleOptions) =>
  SetMetadata(CUSTOM_THROTTLE_KEY, options);
