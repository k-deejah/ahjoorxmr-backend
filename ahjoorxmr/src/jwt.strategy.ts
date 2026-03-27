import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';

import { JwtPayload } from '../interfaces/jwt-payload.interface';
import { AuthService } from '../auth.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    configService: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.getOrThrow<string>('JWT_SECRET'),
    });
  }

  /**
   * Called after signature verification.  We re-fetch the user so that
   * deactivated accounts are rejected even if the token is still valid.
   *
   * The returned object is attached to `request.user`.
   */
  async validate(payload: JwtPayload): Promise<JwtPayload> {
    const user = await this.authService.findById(payload.sub);

    if (!user || !user.isActive) {
      throw new UnauthorizedException('User not found or deactivated');
    }

    // Always return the canonical walletAddress from the DB, not just
    // what is in the token, so stale tokens can't spoof a changed address.
    return {
      sub: user.id,
      walletAddress: user.walletAddress ?? payload.walletAddress,
      email: user.email ?? undefined,
      authMethod: payload.authMethod,
    };
  }
}
