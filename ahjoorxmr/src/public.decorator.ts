import { SetMetadata } from '@nestjs/common';
import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { AuthenticatedRequest } from '../interfaces/authenticated-request.interface';

// ---------------------------------------------------------------------------
// @Public() — skip JwtAuthGuard for a route
// ---------------------------------------------------------------------------
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

// ---------------------------------------------------------------------------
// @CurrentUser() — inject the validated JWT payload into a route handler
// ---------------------------------------------------------------------------
export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): JwtPayload => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user;
  },
);

// ---------------------------------------------------------------------------
// @WalletAddress() — shorthand to pull just the wallet address
// ---------------------------------------------------------------------------
export const WalletAddress = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
    return request.user.walletAddress;
  },
);
