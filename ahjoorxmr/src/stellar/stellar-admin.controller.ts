import {
  Controller,
  Get,
  Param,
  UseGuards,
  Version,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { StellarService } from './stellar.service';

@ApiTags('Admin - Stellar')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/stellar')
export class StellarAdminController {
  constructor(private readonly stellarService: StellarService) {}

  @Get('trustlines/:accountId')
  @Version('1')
  @ApiOperation({
    summary: 'Get account trustlines',
    description:
      'Returns all Stellar assets an account has trustlines for. Useful for validating group asset setup before creation.',
  })
  @ApiParam({ name: 'accountId', description: 'Stellar account ID (G-address)', example: 'GBXGQJWVLWOYHFLVTKWV5FGHA3LNYY2JQKM7OAJAUEQFU6LPCSEFVXON' })
  @ApiResponse({
    status: 200,
    description: 'Trustlines retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          assetCode: { type: 'string', example: 'USDC' },
          assetIssuer: { type: 'string', nullable: true, example: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN' },
          balance: { type: 'string', example: '100.0000000' },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden – admin only' })
  @ApiResponse({ status: 502, description: 'Stellar RPC error' })
  async getAccountTrustlines(
    @Param('accountId') accountId: string,
  ): Promise<Array<{ assetCode: string; assetIssuer: string | null; balance: string }>> {
    return this.stellarService.getAccountTrustlines(accountId);
  }
}
