import {
  Body,
  Controller,
  Get,
  Patch,
  Request,
  UseGuards,
  Version,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UsersService } from './users.service';

@Controller('users')
@Version('1')
@UseGuards(JwtAuthGuard)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /**
   * GET /api/v1/users/me
   * Returns the authenticated user's profile (no sensitive fields).
   */
  @Get('me')
  async getMe(@Request() req): Promise<UserResponseDto> {
    const user = await this.usersService.findByWalletAddress(
      req.user.walletAddress,
    );
    return new UserResponseDto(user);
  }

  /**
   * PATCH /api/v1/users/me
   * Partially updates the authenticated user's profile.
   */
  @Patch('me')
  async updateMe(
    @Request() req,
    @Body() updateUserDto: UpdateUserDto,
  ): Promise<UserResponseDto> {
    const updated = await this.usersService.upsertByWalletAddress(
      req.user.walletAddress,
      updateUserDto,
    );
    return new UserResponseDto(updated);
  }
}
