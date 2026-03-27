import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { KYC_ERROR_MESSAGES, KycStatus } from './kyc.constants';

// Symbol used by @SkipKycCheck() decorator
export const SKIP_KYC_KEY = 'skipKycCheck';

/**
 * Decorator to explicitly opt a route out of KYC enforcement.
 * Use sparingly — prefer whitelisting at the module level.
 */
export const SkipKycCheck = () =>
  (target: any, key?: string | symbol, descriptor?: any) => {
    if (descriptor) {
      Reflect.defineMetadata(SKIP_KYC_KEY, true, descriptor.value);
      return descriptor;
    }
    Reflect.defineMetadata(SKIP_KYC_KEY, true, target);
    return target;
  };

/**
 * KycGuard — blocks any authenticated user whose kycStatus is not APPROVED.
 *
 * Resolution order:
 *  1. Check JWT claim `kycStatus` (fast path — no DB hit).
 *  2. If claim is missing, fall back to a lightweight DB look-up.
 *
 * Attach to controllers or individual routes with @UseGuards(KycGuard).
 */
@Injectable()
export class KycGuard implements CanActivate {
  private readonly logger = new Logger(KycGuard.name);

  constructor(
    private readonly reflector: Reflector,
    // Inject whatever User entity/repository your project uses.
    // Replace `User` with your actual entity class and adjust the token.
    @InjectRepository('User')
    private readonly userRepository: Repository<any>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Allow routes that explicitly opt out
    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_KYC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (skip) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      // JwtAuthGuard should have already rejected unauthenticated requests;
      // reaching here without a user is a misconfiguration.
      throw new ForbiddenException(KYC_ERROR_MESSAGES.FORBIDDEN);
    }

    const kycStatus = await this.resolveKycStatus(user);
    this.assertApproved(kycStatus, user.sub ?? user.id);

    return true;
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private async resolveKycStatus(jwtPayload: any): Promise<KycStatus> {
    // Fast path: status embedded in the JWT by your AuthService
    if (jwtPayload.kycStatus) {
      return jwtPayload.kycStatus as KycStatus;
    }

    // Fallback: fetch from DB (covers tokens issued before the status field was added)
    const userId = jwtPayload.sub ?? jwtPayload.id;
    const user = await this.userRepository.findOne({
      where: { id: userId },
      select: ['id', 'kycStatus'],
    });

    if (!user) {
      this.logger.warn(`KycGuard: user ${userId} not found in database`);
      throw new ForbiddenException(KYC_ERROR_MESSAGES.FORBIDDEN);
    }

    return user.kycStatus as KycStatus;
  }

  private assertApproved(status: KycStatus, userId: string): void {
    if (status === KycStatus.APPROVED) return;

    this.logger.warn(
      `KycGuard: blocked user ${userId} — kycStatus is "${status}"`,
    );

    const messages: Record<string, string> = {
      [KycStatus.NONE]: KYC_ERROR_MESSAGES.NOT_SUBMITTED,
      [KycStatus.PENDING]: KYC_ERROR_MESSAGES.PENDING,
      [KycStatus.REJECTED]: KYC_ERROR_MESSAGES.REJECTED,
    };

    throw new ForbiddenException(
      messages[status] ?? KYC_ERROR_MESSAGES.FORBIDDEN,
    );
  }
}
