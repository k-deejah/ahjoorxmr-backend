import { Controller, Get, UseGuards, Version } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { DeprecationUsageService } from './deprecation-usage.service';

@ApiTags('Admin Deprecation')
@Controller('admin/deprecation-usage')
@UseGuards(JwtAuthGuard, RolesGuard)
@ApiBearerAuth('JWT-auth')
export class DeprecationUsageController {
  constructor(private readonly usageService: DeprecationUsageService) {}

  @Get()
  @Version('1')
  @Roles('admin')
  @ApiOperation({
    summary: 'Get v1 API usage stats for last 30 days',
    description:
      'Returns aggregated v1 call counts per route and user for the last 30 days.',
  })
  @ApiResponse({
    status: 200,
    description: 'Deprecation usage stats',
    schema: {
      type: 'object',
      properties: {
        totalCalls: { type: 'number' },
        byRoute: { type: 'object' },
        byUser: { type: 'object' },
        generatedAt: { type: 'string' },
      },
    },
  })
  async getUsage() {
    return this.usageService.getV1UsageStats();
  }
}
