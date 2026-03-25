import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { TrustedIpService } from '../services/trusted-ip.service';
import { SkipRateLimit } from '../decorators/rate-limit.decorator';

/**
 * Controller for managing rate limiting configuration
 * This should be protected and only accessible to administrators
 */
@ApiTags('Rate Limiting Admin')
@ApiBearerAuth()
@Controller({ path: 'admin/rate-limit', version: '1' })
// @UseGuards(AdminGuard) // Add admin authentication guard
export class RateLimitAdminController {
  constructor(private readonly trustedIpService: TrustedIpService) {}

  @Get('blocked-ips')
  @SkipRateLimit()
  @ApiOperation({ summary: 'Get all blocked IP addresses' })
  @ApiResponse({
    status: 200,
    description: 'List of blocked IPs',
    schema: {
      example: [
        {
          ip: '192.168.1.100',
          reason: 'Exceeded 5 violations in 3600s',
          ttl: 3452,
        },
      ],
    },
  })
  async getBlockedIps() {
    return this.trustedIpService.getBlockedIps();
  }

  @Delete('blocked-ips/:ip')
  @SkipRateLimit()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Unblock an IP address' })
  @ApiParam({ name: 'ip', description: 'IP address to unblock' })
  @ApiResponse({ status: 204, description: 'IP unblocked successfully' })
  @ApiResponse({ status: 404, description: 'IP not found' })
  async unblockIp(@Param('ip') ip: string) {
    await this.trustedIpService.unblockIp(ip);
    return;
  }

  @Post('blocked-ips/:ip')
  @SkipRateLimit()
  @ApiOperation({ summary: 'Manually block an IP address' })
  @ApiParam({ name: 'ip', description: 'IP address to block' })
  @ApiResponse({ status: 201, description: 'IP blocked successfully' })
  async blockIp(@Param('ip') ip: string) {
    await this.trustedIpService.blockIp(ip, 3600, 'Manually blocked by admin');
    return { message: 'IP blocked successfully', ip };
  }

  @Get('ip-info/:ip')
  @SkipRateLimit()
  @ApiOperation({ summary: 'Get information about an IP address' })
  @ApiParam({ name: 'ip', description: 'IP address to check' })
  @ApiResponse({
    status: 200,
    description: 'IP information',
    schema: {
      example: {
        ip: '192.168.1.100',
        trusted: false,
        blocked: false,
        violations: 2,
      },
    },
  })
  async getIpInfo(@Param('ip') ip: string) {
    return this.trustedIpService.getIpInfo(ip);
  }

  @Post('trusted-ips/:ip')
  @SkipRateLimit()
  @ApiOperation({ summary: 'Add an IP to trusted list' })
  @ApiParam({ name: 'ip', description: 'IP address to trust' })
  @ApiResponse({ status: 201, description: 'IP added to trusted list' })
  async addTrustedIp(@Param('ip') ip: string) {
    await this.trustedIpService.addTrustedIp(ip);
    return { message: 'IP added to trusted list', ip };
  }

  @Delete('trusted-ips/:ip')
  @SkipRateLimit()
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove an IP from trusted list' })
  @ApiParam({
    name: 'ip',
    description: 'IP address to remove from trusted list',
  })
  @ApiResponse({ status: 204, description: 'IP removed from trusted list' })
  async removeTrustedIp(@Param('ip') ip: string) {
    await this.trustedIpService.removeTrustedIp(ip);
    return;
  }
}
