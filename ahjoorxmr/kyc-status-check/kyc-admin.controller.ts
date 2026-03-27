import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Request,
  UseGuards,
} from '@nestjs/common';
import { UpdateKycStatusDto, KycStatusResponseDto } from './kyc.dto';
import { KycService } from './kyc.service';
// Replace these imports with your project's actual auth guards/decorators
// import { JwtAuthGuard } from '../auth/jwt-auth.guard';
// import { RolesGuard } from '../auth/roles.guard';
// import { Roles } from '../auth/roles.decorator';

@Controller('admin/users')
// @UseGuards(JwtAuthGuard, RolesGuard)   ← uncomment and adjust to your auth setup
export class KycAdminController {
  constructor(private readonly kycService: KycService) {}

  /**
   * PATCH /admin/users/:id/kyc
   * Approve or reject a user's KYC with an optional reason.
   * Requires ADMIN role (enforced by your RolesGuard).
   */
  @Patch(':id/kyc')
  // @Roles('admin')
  @HttpCode(HttpStatus.OK)
  async updateKycStatus(
    @Param('id', ParseUUIDPipe) userId: string,
    @Body() dto: UpdateKycStatusDto,
    @Request() req: any,
  ): Promise<KycStatusResponseDto> {
    const adminId = req.user?.sub ?? req.user?.id;
    return this.kycService.updateKycStatus(userId, dto, adminId);
  }

  /**
   * GET /admin/users/:id/kyc
   * Fetch the current KYC status for audit or review purposes.
   */
  @Get(':id/kyc')
  // @Roles('admin')
  async getKycStatus(
    @Param('id', ParseUUIDPipe) userId: string,
  ): Promise<KycStatusResponseDto> {
    return this.kycService.getKycStatus(userId);
  }
}
