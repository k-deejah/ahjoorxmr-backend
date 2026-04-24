import {
  Controller,
  Get,
  UnauthorizedException,
  Headers,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiTags, ApiOperation, ApiSecurity } from '@nestjs/swagger';
import { register } from 'prom-client';

@ApiTags('Metrics')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly configService: ConfigService) {}

  @Get()
  @ApiOperation({ summary: 'Get Prometheus metrics' })
  @ApiSecurity('api-key')
  async getMetrics(@Headers('x-api-key') apiKey: string): Promise<string> {
    const expectedApiKey = this.configService.get<string>('METRICS_API_KEY');

    if (!expectedApiKey || apiKey !== expectedApiKey) {
      throw new UnauthorizedException('Invalid or missing API key');
    }

    return register.metrics();
  }
}
