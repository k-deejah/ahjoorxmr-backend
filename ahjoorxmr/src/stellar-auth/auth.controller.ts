import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Request,
  Version,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import {
  ChallengeRequestDto,
  ChallengeResponseDto,
  RefreshRequestDto,
  VerifyRequestDto,
} from './auth.dto';
import { Public } from '../common/decorators/public.decorator';

@Controller('auth')
@Version('1')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('challenge')
  @HttpCode(HttpStatus.OK)
  async challenge(
    @Body() dto: ChallengeRequestDto,
  ): Promise<ChallengeResponseDto> {
    const challenge = await this.authService.generateChallenge(
      dto.walletAddress,
    );
    return { challenge };
  }

  @Public()
  @Post('verify')
  @HttpCode(HttpStatus.OK)
  async verify(@Body() dto: VerifyRequestDto) {
    return this.authService.verifySignature(
      dto.walletAddress,
      dto.signature,
      dto.challenge,
    );
  }

  @Public()
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Body() dto: RefreshRequestDto) {
    return this.authService.refreshAccessToken(dto.refreshToken);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Request() req: any) {
    await this.authService.logout(req.user.walletAddress);
  }
}
