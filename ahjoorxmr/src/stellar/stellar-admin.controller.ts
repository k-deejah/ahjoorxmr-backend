import { Controller, Get, Param, UseGuards, Version } from '@nestjs/common';
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
import { BalanceMonitorService } from './balance-monitor.service';

@ApiTags('Admin - Stellar')
@ApiBearerAuth('JWT-auth')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
@Controller('admin/stellar')
export class StellarAdminController {
  constructor(
    private readonly stellarService: StellarService,
    private readonly balanceMonitorService: BalanceMonitorService,
  ) {}

  @Get('trustlines/:accountId')
  @Version('1')
  @ApiOperation({
    summary: 'Get account trustlines',
    description:
      'Returns all Stellar assets an account has trustlines for. Useful for validating group asset setup before creation.',
  })
  @ApiParam({
    name: 'accountId',
    description: 'Stellar account ID (G-address)',
    example: 'GBXGQJWVLWOYHFLVTKWV5FGHA3LNYY2JQKM7OAJAUEQFU6LPCSEFVXON',
  })
  @ApiResponse({
    status: 200,
    description: 'Trustlines retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          assetCode: { type: 'string', example: 'USDC' },
          assetIssuer: {
            type: 'string',
            nullable: true,
            example: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
          },
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
  ): Promise<
    Array<{ assetCode: string; assetIssuer: string | null; balance: string }>
  > {
    return this.stellarService.getAccountTrustlines(accountId);
  }

  @Get('balances')
  @Version('1')
  @ApiOperation({
    summary: 'Get current balances for all monitored accounts',
    description:
      'Returns native XLM balances for the issuer account and all active group contract accounts. Includes balance status (low/normal) based on configured minimum threshold.',
  })
  @ApiResponse({
    status: 200,
    description: 'Balances retrieved successfully',
    schema: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          accountId: {
            type: 'string',
            example: 'GBXGQJWVLWOYHFLVTKWV5FGHA3LNYY2JQKM7OAJAUEQFU6LPCSEFVXON',
          },
          currentBalance: { type: 'string', example: '1000.5000000' },
          minimumRequired: { type: 'string', example: '5' },
          isLow: { type: 'boolean', example: false },
          timestamp: {
            type: 'string',
            format: 'date-time',
            example: '2024-04-25T10:30:00.000Z',
          },
        },
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden – admin only' })
  @ApiResponse({ status: 502, description: 'Stellar RPC error' })
  async getMonitoredBalances(): Promise<
    Array<{
      accountId: string;
      currentBalance: string;
      minimumRequired: string;
      isLow: boolean;
      timestamp: Date;
    }>
  > {
    return this.balanceMonitorService.getCurrentBalances();
  }
}
