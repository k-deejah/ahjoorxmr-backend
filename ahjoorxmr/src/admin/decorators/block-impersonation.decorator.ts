import { UseGuards, applyDecorators } from '@nestjs/common';
import { BlockImpersonationGuard } from '../block-impersonation.guard';

/**
 * Decorator that applies BlockImpersonationGuard to any endpoint.
 * Use on write endpoints (POST/PATCH/DELETE) to prevent impersonation tokens
 * from performing mutations.
 *
 * @example
 * @BlockImpersonation()
 * @Post('contributions')
 * createContribution(...) {}
 */
export function BlockImpersonation() {
  return applyDecorators(UseGuards(BlockImpersonationGuard));
}
