import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Version,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
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
import { RegisterDto, LoginDto, RefreshTokenDto } from './dto/auth.dto';

import { JwtAuthGuard } from './guards/jwt-auth.guard';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly twoFactorService: TwoFactorService,
  ) { }

  @Post('login')
  @Version('1')
  @Throttle({ default: { limit: 5, ttl: 60000 } }) // 5 requests per minute
  @ApiOperation({
    summary: 'User login',
    description:
      'Authenticate user and return JWT token. Rate limited to 5 requests per minute.',
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid credentials',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many requests - Rate limit exceeded',
  })
  async login(@Body() loginDto: LoginDto) {
    return this.authService.login(loginDto);
  }

  @Post('register')
  @Version('1')
  @Throttle({ default: { limit: 3, ttl: 300000 } }) // 3 requests per 5 minutes
  @ApiOperation({
    summary: 'User registration',
    description:
      'Register a new user. Rate limited to 3 requests per 5 minutes.',
  })
  @ApiResponse({
    status: 201,
    description: 'Registration successful',
  })
  @ApiResponse({
    status: 409,
    description: 'Conflict - Email already exists',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many requests - Rate limit exceeded',
  })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto);
  }

  @Post('refresh')
  @Version('1')
  @ApiOperation({
    summary: 'Refresh access token',
    description: 'Get a new access token using a valid refresh token.',
  })
  @ApiResponse({
    status: 200,
    description: 'Tokens refreshed successfully',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid refresh token',
  })
  async refresh(@Body() refreshTokenDto: RefreshTokenDto) {
    try {
      const { refreshToken } = refreshTokenDto;
      const payload = await this.authService.verifyRefreshToken(refreshToken);
      return this.authService.refreshTokens(payload.sub, refreshToken);
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }
  }

  @Post('logout')
  @Version('1')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Logout user',
    description: 'Invalidate all refresh tokens and end all sessions.',
  })
  @ApiResponse({
    status: 200,
    description: 'Logout successful',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async logout(@Req() req: any): Promise<{ message: string }> {
    await this.authService.logout(req.user.id);
    return { message: 'Logout successful' };
  }

  @Post('reset-password')
  @Throttle({ default: { limit: 3, ttl: 300000 } }) // 3 requests per 5 minutes
  @ApiOperation({
    summary: 'Reset password',
    description:
      'Request password reset. Rate limited to 3 requests per 5 minutes.',
  })
  @ApiResponse({
    status: 200,
    description: 'Password reset email sent',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many requests - Rate limit exceeded',
  })
  async resetPassword(@Body() resetDto: any) {
    // Mock implementation
    return { message: 'Password reset endpoint - implement reset logic' };
  }

  @Get('profile')
  @Version('1')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get user profile',
    description:
      'Returns the authenticated user profile information. Requires valid JWT token.',
  })
  @ApiResponse({
    status: 200,
    description: 'User profile retrieved successfully',
    type: UserProfileDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 401 },
        message: { type: 'string', example: 'Unauthorized' },
        error: { type: 'string', example: 'Unauthorized' },
      },
    },
  })
  @ApiResponse({
    status: 404,
    description: 'User not found',
    type: NotFoundErrorResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
    type: InternalServerErrorResponseDto,
  })
  getProfile(@Req() req: any): UserProfileDto {
    return req.user;
  }

  @Post('2fa/enable')
  @Version('1')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Enable Two-Factor Authentication',
    description: 'Generate QR code and backup codes for 2FA setup',
  })
  @ApiResponse({
    status: 200,
    description: '2FA setup data generated',
    type: Enable2FAResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async enable2FA(): Promise<Enable2FAResponseDto> {
    // Mock implementation - replace with actual user retrieval
    const userEmail = 'user@example.com';

    const secret = this.twoFactorService.generateSecret();
    const qrCode = await this.twoFactorService.generateQRCode(
      userEmail,
      secret,
    );
    const backupCodes = this.twoFactorService.generateBackupCodes();

    // TODO: Save secret and hashed backup codes to user entity
    // const hashedBackupCodes = backupCodes.map(code =>
    //   this.twoFactorService.hashBackupCode(code)
    // );

    return {
      qrCode,
      secret,
      backupCodes,
    };
  }

  @Post('2fa/verify')
  @Version('1')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Verify and activate 2FA',
    description: 'Verify TOTP token to complete 2FA setup',
  })
  @ApiResponse({
    status: 200,
    description: '2FA enabled successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid token',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async verify2FA(@Body() dto: Verify2FADto) {
    // Mock implementation - replace with actual user retrieval
    const userSecret = 'mock-secret'; // Get from user entity

    const isValid = this.twoFactorService.verifyToken(dto.token, userSecret);

    if (!isValid) {
      return { success: false, message: 'Invalid token' };
    }

    // TODO: Update user entity to set twoFactorEnabled = true

    return { success: true, message: '2FA enabled successfully' };
  }

  @Post('2fa/disable')
  @Version('1')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Disable Two-Factor Authentication',
    description: 'Disable 2FA with password and TOTP verification',
  })
  @ApiResponse({
    status: 200,
    description: '2FA disabled successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid credentials or token',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async disable2FA(@Body() dto: Disable2FADto) {
    // Mock implementation - replace with actual verification
    // TODO: Verify password
    // TODO: Verify TOTP token
    // TODO: Update user entity to set twoFactorEnabled = false, clear secret and backup codes

    return { success: true, message: '2FA disabled successfully' };
  }

  @Post('2fa/login')
  @Version('1')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @ApiOperation({
    summary: 'Complete 2FA login',
    description: 'Verify TOTP token or backup code to complete login',
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid token or backup code',
  })
  @ApiResponse({
    status: 429,
    description: 'Too many requests',
  })
  async login2FA(@Body() dto: Login2FADto) {
    // Mock implementation - replace with actual verification
    const userSecret = 'mock-secret'; // Get from user entity
    const backupCodes = []; // Get from user entity

    // Try TOTP token first
    const isValidToken = this.twoFactorService.verifyToken(
      dto.token,
      userSecret,
    );

    if (isValidToken) {
      return { success: true, message: 'Login successful' };
    }

    // Try backup code
    const isValidBackupCode = this.twoFactorService.verifyBackupCode(
      dto.token,
      backupCodes,
    );

    if (isValidBackupCode) {
      // TODO: Remove used backup code from user entity
      return { success: true, message: 'Login successful with backup code' };
    }

    return { success: false, message: 'Invalid token or backup code' };
  }
}
