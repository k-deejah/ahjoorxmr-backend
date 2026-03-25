import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * Placeholder JWT authentication guard for the Groups module.
 *
 * TODO: Replace with actual JWT authentication from auth module when fully integrated.
 *
 * For now, this guard:
 * - Checks for an Authorization header with a Bearer token
 * - Accepts a UUID as a valid token (for development/testing)
 * - Attaches { id, userId, walletAddress } to req.user
 *   (walletAddress equals the token value when it is not a UUID, to support wallet-based auth)
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization as string | undefined;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or invalid authorization header',
      );
    }

    const token = authHeader.substring(7);

    if (!token) {
      throw new UnauthorizedException('Missing JWT token');
    }

    // TODO: Validate real JWT and extract user data from payload.
    // For now, accept a UUID as userId (testing) or any non-empty string as walletAddress.
    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (uuidRegex.test(token)) {
      request.user = {
        id: token,
        userId: token,
        walletAddress: token,
      };
      return true;
    }

    throw new UnauthorizedException('Invalid JWT token');
  }
}
