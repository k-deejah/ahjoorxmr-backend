import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { Observable } from 'rxjs';

@Injectable()
export class AdminGuard implements CanActivate {
  canActivate(
    context: ExecutionContext,
  ): boolean | Promise<boolean> | Observable<boolean> {
    const request = context.switchToHttp().getRequest();

    // Check for admin authentication
    // This is a simple example - replace with your actual auth logic
    const isAdmin = this.validateAdmin(request);

    if (!isAdmin) {
      throw new UnauthorizedException('Admin access required');
    }

    return true;
  }

  private validateAdmin(request: any): boolean {
    // Example: Check for admin role in headers, JWT token, or session
    // Replace this with your actual authentication logic
    const adminToken = request.headers['x-admin-token'];
    return adminToken === 'admin-secret-token'; // Replace with real validation
  }
}
