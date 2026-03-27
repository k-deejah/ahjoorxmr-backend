import {
  Controller,
  Post,
  Body,
  HttpCode,
  HttpStatus,
  Get,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';

import { AuthService } from './auth.service';
import {
  GetChallengeDto,
  VerifyChallengeDto,
  RegisterDto,
  LoginDto,
} from './dto/auth.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Public, CurrentUser } from './decorators/public.decorator';
import { JwtPayload } from './interfaces/jwt-payload.interface';

@ApiTags('Auth')
@Controller('auth')
export class StellarAuthController {
  constructor(private readonly authService: AuthService) {}

  // -------------------------------------------------------------------------
  // Wallet-based auth  (PRIMARY PATH)
  // -------------------------------------------------------------------------

  @Public()
  @Post('wallet/challenge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Request a sign challenge for a Stellar wallet address',
  })
  @ApiOkResponse({
    description: 'Challenge string to be signed with the Stellar private key',
    schema: { example: { challenge: 'cheese-wallet:auth:G...:1712345678:abc' } },
  })
  getChallenge(@Body() dto: GetChallengeDto): { challenge: string } {
    return this.authService.generateChallenge(dto.walletAddress);
  }

  @Public()
  @Post('wallet/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary:
      'Verify a signed challenge — registers new wallet or logs in existing one',
  })
  @ApiOkResponse({
    description: 'JWT access token + user object',
    schema: {
      example: {
        accessToken: 'eyJ...',
        isNew: true,
        user: { id: 'uuid', walletAddress: 'G...' },
      },
    },
  })
  @ApiUnauthorizedResponse({ description: 'Invalid or expired signature' })
  async verifyChallenge(@Body() dto: VerifyChallengeDto) {
    return this.authService.registerWithWallet(
      dto.walletAddress,
      dto.signature,
      dto.challenge,
    );
  }

  // -------------------------------------------------------------------------
  // Legacy email / password  (preserved)
  // -------------------------------------------------------------------------

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register with email + password (legacy path)' })
  @ApiCreatedResponse({ description: 'User created, JWT returned' })
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with email + password (legacy path)' })
  @ApiOkResponse({ description: 'JWT access token returned' })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  async login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  // -------------------------------------------------------------------------
  // Protected — verify token health
  // -------------------------------------------------------------------------

  @UseGuards(JwtAuthGuard)
  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Return current authenticated user from JWT' })
  getMe(@CurrentUser() user: JwtPayload) {
    return user;
  }
}
