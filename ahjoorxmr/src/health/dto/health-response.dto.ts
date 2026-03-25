import { ApiProperty } from '@nestjs/swagger';

export class HealthResponseDto {
  @ApiProperty({
    description: 'Health status of the application',
    example: 'ok',
  })
  status: string;

  @ApiProperty({
    description: 'Current timestamp in ISO format',
    example: '2024-01-01T00:00:00.000Z',
  })
  timestamp: string;

  @ApiProperty({
    description: 'Application uptime in seconds',
    example: 3600,
  })
  uptime: number;

  @ApiProperty({
    description: 'Current environment',
    example: 'development',
  })
  environment: string;

  @ApiProperty({
    description: 'Application version',
    example: '0.0.1',
  })
  version: string;
}

export class MemoryUsageDto {
  @ApiProperty({
    description: 'Resident Set Size memory usage',
    example: '50 MB',
  })
  rss: string;

  @ApiProperty({
    description: 'Total heap memory',
    example: '30 MB',
  })
  heapTotal: string;

  @ApiProperty({
    description: 'Used heap memory',
    example: '20 MB',
  })
  heapUsed: string;

  @ApiProperty({
    description: 'External memory usage',
    example: '5 MB',
  })
  external: string;
}

export class ReadinessChecksDto {
  @ApiProperty({
    description: 'Database connection status',
    example: 'ok',
  })
  database: string;

  @ApiProperty({
    description: 'Database response time',
    example: '15ms',
  })
  databaseResponseTime: string;

  @ApiProperty({
    description: 'Database connection pool status',
    example: { active: 2, idle: 8 },
  })
  connectionPool: any;

  @ApiProperty({
    description: 'Memory usage information',
    type: MemoryUsageDto,
  })
  memory: MemoryUsageDto;
}

export class ReadinessResponseDto {
  @ApiProperty({
    description: 'Readiness status of the application',
    example: 'ready',
  })
  status: string;

  @ApiProperty({
    description: 'Current timestamp in ISO format',
    example: '2024-01-01T00:00:00.000Z',
  })
  timestamp: string;

  @ApiProperty({
    description: 'Readiness checks results',
    type: ReadinessChecksDto,
  })
  checks: ReadinessChecksDto;
}
