import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * Placeholder JWT authentication guard for user endpoints.
 *
 * TODO: Replace with actual JWT authentication from auth module when available.
 *
 * For now, this guard:
 * - Checks for Authorization header with Bearer token
 * - Extracts a mock userId from the token (for development/testing)
 * - In production, this should validate JWT and extract real user data
 */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException(
        'Missing or invalid authorization header',
      );
    }

    // Extract token (everything after "Bearer ")
    const token = authHeader.substring(7);

    if (!token) {
      throw new UnauthorizedException('Missing JWT token');
    }

    // TODO: Validate JWT token and extract real user data
    // For now, we'll use a placeholder approach:
    // - If token is a valid UUID, use it as userId (for testing)
    // - Otherwise, throw unauthorized error

    const uuidRegex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (uuidRegex.test(token)) {
      // Attach user object to request (mimicking JWT payload structure)
      request.user = {
        id: token,
        userId: token, // Support both id and userId for compatibility
      };
      return true;
    }

    throw new UnauthorizedException('Invalid JWT token');
  }
}
