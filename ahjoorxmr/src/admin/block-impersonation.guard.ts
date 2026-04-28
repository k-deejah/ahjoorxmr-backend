import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

/**
 * Guard that blocks write operations (POST, PATCH, PUT, DELETE) when the
 * request is authenticated with an impersonation token.
 * Apply via @BlockImpersonation() decorator on write endpoints.
 */
@Injectable()
export class BlockImpersonationGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest();

    if (req.user?.isImpersonation === true) {
      const method: string = (req.method ?? '').toUpperCase();
      const writeMethods = ['POST', 'PATCH', 'PUT', 'DELETE'];
      if (writeMethods.includes(method)) {
        throw new ForbiddenException(
          'Impersonation tokens cannot perform write operations',
        );
      }
    }

    return true;
  }
}
