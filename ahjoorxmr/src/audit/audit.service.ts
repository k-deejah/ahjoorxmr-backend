import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, Between, LessThan } from 'typeorm';
import { AuditLog } from './entities/audit-log.entity';
import { AuditLogQueryDto } from './dto/audit-log-query.dto';
import {
  PaginatedAuditLogResponseDto,
  AuditLogResponseDto,
} from './dto/audit-log-response.dto';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
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
      take: limit,
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
}
