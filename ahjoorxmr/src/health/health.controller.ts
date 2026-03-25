import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthService } from './health.service';
import {
  HealthResponseDto,
  ReadinessResponseDto,
} from './dto/health-response.dto';
import { InternalServerErrorResponseDto } from '../common/dto/error-response.dto';

@ApiTags('Health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get()
  @ApiOperation({
    summary: 'Get application health status',
    description:
      'Returns the current health status of the application including uptime and environment information',
  })
  @ApiResponse({
    status: 200,
    description: 'Health status retrieved successfully',
    type: HealthResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
    type: InternalServerErrorResponseDto,
  })
  async getHealth(): Promise<HealthResponseDto> {
    return this.healthService.getHealthStatus();
  }

  @Get('ready')
  @ApiOperation({
    summary: 'Get application readiness status',
    description:
      'Returns the readiness status including system checks like database connectivity and memory usage',
  })
  @ApiResponse({
    status: 200,
    description: 'Readiness status retrieved successfully',
    type: ReadinessResponseDto,
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
    type: InternalServerErrorResponseDto,
  })
  async getReadiness(): Promise<ReadinessResponseDto> {
    return this.healthService.getReadinessStatus();
  }

  @Get('database')
  @ApiOperation({
    summary: 'Get database health status',
    description:
      'Returns detailed database health information including connection pool stats and database size',
  })
  @ApiResponse({
    status: 200,
    description: 'Database health status retrieved successfully',
  })
  async getDatabaseHealth() {
    return this.healthService.getDatabaseHealth();
  }
}
