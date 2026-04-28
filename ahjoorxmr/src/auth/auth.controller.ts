import {
  Controller,
  Get,
  Post,
  Delete,
  Body,
  UseGuards,
  Version,
  Req,
  UnauthorizedException,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { UserProfileDto } from './dto/auth-response.dto';
import {
  InternalServerErrorResponseDto,
  NotFoundErrorResponseDto,
} from '../common/dto/error-response.dto';
import {
  Enable2FAResponseDto,
  Verify2FADto,
  Disable2FADto,
  Login2FADto,
} from './dto/two-factor.dto';
import { TwoFactorService } from './two-factor.service';
import { AuthService } from './auth.service';
import {
  RegisterDto,
  LoginDto,
  RefreshTokenDto,
  RegisterWithWalletDto,
} from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly twoFactorService: TwoFactorService,
  ) { }

  @Post('login')
  @Version('1')
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'User login' })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid credentials' })
  @ApiResponse({ status: 403, description: '2FA verification required' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('register')
  @Version('1')
  @Throttle({ auth: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'User registration' })
  @ApiResponse({ status: 201, description: 'Registration successful' })
  @ApiResponse({ status: 409, description: 'Email already exists' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('wallet/register')
  @Version('1')
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  @ApiOperation({ summary: 'Register with Stellar wallet' })
  @ApiResponse({ status: 201, description: 'Registration successful' })
  @ApiResponse({ status: 401, description: 'Invalid signature' })
  async registerWithWallet(@Body() dto: RegisterWithWalletDto) {
    return this.authService.registerWithWallet(
      dto.walletAddress,
      dto.signature,
      dto.challenge,
    );
  }

  @Post('refresh')
  @Version('1')
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiResponse({ status: 200, description: 'Tokens refreshed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid refresh token' })
  async refresh(@Body() refreshTokenDto: RefreshTokenDto, @Req() req: any) {
    try {
      return await this.authService.refreshTokens(refreshTokenDto.refreshToken, {
        ipAddress: req.ip,
        deviceId: req.headers['x-device-id'] ?? null,
        deviceName: req.headers['x-device-name'] ?? null,
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  @Post('logout')
  @Version('1')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Logout user' })
  @ApiResponse({ status: 200, description: 'Logout successful' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async logout(@Req() req: any, @Body() body: RefreshTokenDto): Promise<{ message: string }> {
    await this.authService.logout(req.user.id, body?.refreshToken);
    return { message: 'Logout successful' };
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 3, ttl: 300000 } })
  @ApiOperation({ summary: 'Reset password' })
  @ApiResponse({ status: 200, description: 'Password reset email sent' })
  async resetPassword(@Body() _resetDto: any) {
    return { message: 'Password reset endpoint - implement reset logic' };
  }

  @Get('profile')
  @Version('1')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({ summary: 'Get user profile' })
  @ApiResponse({ status: 200, type: UserProfileDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, type: NotFoundErrorResponseDto })
  @ApiResponse({ status: 500, type: InternalServerErrorResponseDto })
  getProfile(@Req() req: any): UserProfileDto {
    return req.user;
  }

  // ── 2FA endpoints ──────────────────────────────────────────────────────────

  @Post('2fa/enable')
  @Version('1')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Enable Two-Factor Authentication',
    description:
      'Generates a TOTP secret, QR code, and backup codes. ' +
      'The secret is persisted immediately; call POST /auth/2fa/verify with a live ' +
      'TOTP token to activate enforcement.',
  })
  @ApiResponse({ status: 200, type: Enable2FAResponseDto })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async enable2FA(@Req() req: any): Promise<Enable2FAResponseDto> {
    return this.twoFactorService.enable(req.user.id);
  }

  @Post('2fa/verify')
  @Version('1')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verify and activate 2FA',
    description:
      'Confirms the authenticator app is correctly configured by verifying a live ' +
      'TOTP token, then sets twoFactorEnabled = true on the user record.',
  })
  @ApiResponse({ status: 200, description: '2FA enabled successfully' })
  @ApiResponse({ status: 400, description: 'Invalid TOTP token' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async verify2FA(
    @Req() req: any,
    @Body() dto: Verify2FADto,
  ): Promise<{ message: string }> {
    await this.twoFactorService.verify(req.user.id, dto.token);
    return { message: '2FA enabled successfully' };
  }

  @Post('2fa/disable')
  @Version('1')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Disable Two-Factor Authentication',
    description:
      'Requires the current account password and a valid TOTP token. ' +
      'Clears twoFactorSecret, twoFactorEnabled, and backupCodes from the user record.',
  })
  @ApiResponse({ status: 200, description: '2FA disabled successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request' })
  @ApiResponse({ status: 401, description: 'Invalid password or TOTP token' })
  async disable2FA(
    @Req() req: any,
    @Body() dto: Disable2FADto,
  ): Promise<{ message: string }> {
    await this.twoFactorService.disable(req.user.id, dto.password, dto.token);
    return { message: '2FA disabled successfully' };
  }

  @Post('2fa/login')
  @Version('1')
  @Throttle({ default: { limit: 5, ttl: 900000 } })
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Complete 2FA login',
    description:
      'Exchange the pre-auth token (received as a 403 from POST /auth/login) ' +
      'plus a TOTP token or backup code for full access + refresh tokens. ' +
      'A backup code is consumed on first use and cannot be reused.',
  })
  @ApiResponse({ status: 200, description: 'Login successful' })
  @ApiResponse({ status: 401, description: 'Invalid token or backup code' })
  @ApiResponse({ status: 429, description: 'Rate limit exceeded' })
  async login2FA(@Body() dto: Login2FADto) {
    const userId = await this.twoFactorService.completeTwoFactorLogin(
      dto.preAuthToken,
      dto.token,
    );
    const user = await this.authService.getUserForTokenGeneration(userId);
    const tokens = await this.authService.generateTokens(
      user.walletAddress,
      user.email ?? '',
      user.role,
    );
    await this.authService.updateRefreshToken(user.id, tokens.refreshToken);
    return tokens;
  }

  // ── Admin endpoints ────────────────────────────────────────────────────────

  @Get('sessions')
  @Version('1')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'List active sessions',
    description: 'Returns all active sessions (device, IP, lastUsedAt) for the authenticated user.',
  })
  @ApiResponse({ status: 200, description: 'Sessions listed successfully' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async listSessions(@Req() req: any) {
    return this.authService.listSessions(req.user.id);
  }

  @Delete('sessions/:id')
  @Version('1')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Revoke a specific session',
    description: 'Revokes a single session by its ID. Only the owning user may revoke.',
  })
  @ApiParam({ name: 'id', description: 'Session (RefreshToken) UUID', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Session revoked' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Session not found' })
  async revokeSession(
    @Req() req: any,
    @Param('id', ParseUUIDPipe) sessionId: string,
  ): Promise<void> {
    await this.authService.revokeSession(req.user.id, sessionId);
  }

  // ── Admin endpoints ────────────────────────────────────────────────────────

  @Post('admin/users/:userId/revoke-tokens')
  @Version('1')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Revoke all refresh tokens for a user (Admin)',
    description: 'Force sign-out: revokes all active refresh tokens for the specified user.',
  })
  @ApiParam({ name: 'userId', description: 'User UUID', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'All tokens revoked' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden – admin only' })
  async adminRevokeUserTokens(
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<{ message: string }> {
    await this.authService.revokeAllUserTokens(userId);
    return { message: 'All refresh tokens revoked' };
  }
}
