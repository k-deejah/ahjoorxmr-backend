import { Controller, Get, Query, UseGuards, Version } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { PaginatedAuditLogResponseDto } from './dto/audit-log-response.dto';

@ApiTags('Audit')
@Controller('admin/audit-logs')
@Version('1')
@ApiBearerAuth()
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  @ApiOperation({ summary: 'Get audit logs with filtering and pagination' })
  @ApiResponse({
    status: 200,
    description: 'Returns paginated audit logs',
    type: PaginatedAuditLogResponseDto,
  })
  async getAuditLogs(
    @Query() query: AuditLogQueryDto,
  ): Promise<PaginatedAuditLogResponseDto> {
    return this.auditService.findAll(query);
  }
}
