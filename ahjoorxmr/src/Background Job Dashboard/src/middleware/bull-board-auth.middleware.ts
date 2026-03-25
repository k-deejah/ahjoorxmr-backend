import {
  Injectable,
  NestMiddleware,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

@Injectable()
export class BullBoardAuthMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Check for admin authentication
    const adminToken = req.headers['x-admin-token'];

    // Replace with your actual authentication logic
    // Examples: JWT validation, session check, API key validation
    if (adminToken !== 'admin-secret-token') {
      throw new UnauthorizedException(
        'Admin access required for Bull Board dashboard',
      );
    }

    next();
  }
}
