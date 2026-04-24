import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { createHmac } from 'crypto';
import { AuditLog } from './entities/audit-log.entity';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import {
  PaginatedAuditLogResponseDto,
  AuditLogResponseDto,
} from './dto/audit-log-response.dto';
import { UseReadReplica } from '../common/decorators/read-replica.decorator';
import { AuditExportQueryDto } from './dto/audit-export-query.dto';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    private readonly configService: ConfigService,
  ) {}

  async createLog(data: Partial<AuditLog>): Promise<AuditLog> {
    try {
      const log = this.auditLogRepository.create(data);
      return await this.auditLogRepository.save(log);
    } catch (error) {
      this.logger.error('Failed to create audit log', error);
      throw error;
    }
  }

   * @param query - The filter and pagination data
   * @returns Paginated result
   */
  @UseReadReplica()
  async findAll(
    query: AuditLogQueryDto,
  ): Promise<PaginatedAuditLogResponseDto> {
    const {
      userId,
      action,
      resource,
      startDate,
      endDate,
      page = 1,
      limit = 20,
    } = query;

    const whereConditions: any = {};

    if (userId) {
      whereConditions.userId = userId;
    }

    if (action) {
      whereConditions.action = action;
    }

    if (resource) {
      whereConditions.resource = resource;
    }

    if (startDate && endDate) {
      whereConditions.timestamp = Between(
        new Date(startDate),
        new Date(endDate),
      );
    } else if (startDate) {
      whereConditions.timestamp = Between(new Date(startDate), new Date());
    }

    const skip = (page - 1) * limit;

    const [logs, total] = await this.auditLogRepository.findAndCount({
      where: whereConditions,
      order: { timestamp: 'DESC' },
      skip,
      take: limit, // always apply LIMIT so idx_audit_user_created is exercised
    });

    return {
      data: logs.map((log) => AuditLogResponseDto.fromEntity(log)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async archiveOldLogs(daysOld: number = 365): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    try {
      const result = await this.auditLogRepository.delete({
        timestamp: LessThan(cutoffDate),
      });

      const count = result.affected || 0;
      this.logger.log(
        `Archived ${count} audit logs older than ${daysOld} days`,
      );

      return count;
    } catch (error) {
      this.logger.error('Failed to archive old logs', error);
      throw error;
    }
  }

  async exportAuditLogs(
    query: AuditExportQueryDto,
  ): Promise<{ logs: AuditLog[]; count: number }> {
    const whereConditions: any = {};

    if (query.from && query.to) {
      whereConditions.timestamp = Between(new Date(query.from), new Date(query.to));
    } else if (query.from) {
      whereConditions.timestamp = Between(new Date(query.from), new Date());
    }

    if (query.eventTypes && query.eventTypes.length > 0) {
      whereConditions.action = query.eventTypes;
    }

    const [logs, count] = await this.auditLogRepository.findAndCount({
      where: whereConditions,
      order: { timestamp: 'DESC' },
      take: 100000,
    });

    return { logs, count };
  }

  redactPii(log: AuditLog): any {
    const redacted = { ...log };
    if (redacted.metadata?.email) {
      redacted.metadata.email = '[REDACTED]';
    }
    if (redacted.metadata?.walletAddress) {
      redacted.metadata.walletAddress = '[REDACTED]';
    }
    return redacted;
  }

  generateHmacSignature(data: string): string {
    const secret = this.configService.get<string>('PII_HMAC_SECRET');
    return createHmac('sha256', secret).update(data).digest('hex');
  }

  formatAsJson(logs: AuditLog[], includePii: boolean): string {
    const data = includePii ? logs : logs.map((log) => this.redactPii(log));
    return JSON.stringify(data, null, 2);
  }

  formatAsCsv(logs: AuditLog[], includePii: boolean): string {
    if (logs.length === 0) return 'id,userId,action,resource,timestamp,ipAddress\n';

    const headers = 'id,userId,action,resource,timestamp,ipAddress\n';
    const rows = logs.map((log) => {
      const processed = includePii ? log : this.redactPii(log);
      return `${processed.id},${processed.userId || ''},${processed.action},${processed.resource},${processed.timestamp.toISOString()},${processed.ipAddress || ''}`;
    });

    return headers + rows.join('\n');
  }
}
