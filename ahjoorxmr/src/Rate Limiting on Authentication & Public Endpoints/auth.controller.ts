import { Controller, Post, Body, HttpCode, HttpStatus } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  /**
   * POST /auth/challenge
   * Stricter limit: 5 requests per minute per IP.
   */
  @Throttle({ default: { ttl: 60000, limit: 5 } })
  @Post('challenge')
  @HttpCode(HttpStatus.OK)
  async challenge(@Body() body: { address: string }) {
    return this.authService.createChallenge(body.address);
  }

  /**
   * POST /auth/verify
   * Stricter limit: 10 requests per minute per IP.
   */
  @Throttle({ default: { ttl: 60000, limit: 10 } })
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(@Body() body: { address: string; signature: string }) {
    return this.authService.verifyChallenge(body.address, body.signature);
  }
}
