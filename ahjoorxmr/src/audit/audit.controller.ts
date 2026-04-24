import { Controller, Get, Query, UseGuards, Version, Res, HttpStatus, ForbiddenException, Request } from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { Response } from 'express';
import { AuditService } from './audit.service';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import { PaginatedAuditLogResponseDto } from './dto/audit-log-response.dto';
import { AuditExportQueryDto, ExportFormat } from './dto/audit-export-query.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { ConfigService } from '@nestjs/config';

@ApiTags('Audit')
@Controller('admin/audit-logs')
@Version('1')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
export class AuditController {
  constructor(
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  @Get()
  @Roles('admin')
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

  @Get('export')
  @Roles('admin')
  @ApiOperation({ summary: 'Export audit logs for compliance' })
  @ApiResponse({ status: 200, description: 'Audit logs exported' })
  async exportAuditLogs(
    @Query() query: AuditExportQueryDto,
    @Res() res: Response,
    @Request() req: { user: { id: string }; ip: string },
  ): Promise<void> {
    const piiAllowed = this.configService.get<string>('AUDIT_EXPORT_PII_ALLOWED') === 'true';
    const includePii = query.includePii && piiAllowed;

    if (query.includePii && !piiAllowed) {
      throw new ForbiddenException('PII export not allowed');
    }

    const { logs, count } = await this.auditService.exportAuditLogs(query);

    if (count > 100000) {
      res.status(HttpStatus.ACCEPTED).json({
        message: 'Export queued. You will receive an email with the download link.',
        count,
      });
      return;
    }

    const format = query.format || ExportFormat.JSON;
    let content: string;
    let contentType: string;
    let filename: string;

    if (format === ExportFormat.CSV) {
      content = this.auditService.formatAsCsv(logs, includePii);
      contentType = 'text/csv';
      filename = `audit-export-${Date.now()}.csv`;
    } else {
      content = this.auditService.formatAsJson(logs, includePii);
      contentType = 'application/json';
      filename = `audit-export-${Date.now()}.json`;
    }

    const signature = this.auditService.generateHmacSignature(content);

    res.setHeader('X-Export-Signature', signature);
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    if (format === ExportFormat.CSV) {
      content += `\n# HMAC-SHA256: ${signature}`;
    }

    await this.auditService.createLog({
      userId: req.user.id,
      action: 'AUDIT_LOG_EXPORT',
      resource: 'AUDIT_LOG',
      ipAddress: req.ip,
      metadata: { format, includePii, count },
    });

    res.send(content);
  }
}
