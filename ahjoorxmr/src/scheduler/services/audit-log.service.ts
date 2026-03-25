import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { AuditLog } from '../entities/audit-log.entity';

@Injectable()
export class AuditLogService {
  private readonly logger = new Logger(AuditLogService.name);

  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  /**
   * Create a new audit log entry
   */
  async createLog(data: Partial<AuditLog>): Promise<AuditLog> {
    const log = this.auditLogRepository.create(data);
    return await this.auditLogRepository.save(log);
  }

  /**
   * Archive old audit logs (older than specified days)
   * Returns the number of archived logs
   */
  async archiveOldLogs(daysOld: number = 90): Promise<number> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - daysOld);

    try {
      const result = await this.auditLogRepository.delete({
        createdAt: LessThan(cutoffDate),
      });

      const count = result.affected || 0;
      this.logger.log(
        `Archived ${count} audit logs older than ${daysOld} days`,
      );

      return count;
    } catch (error) {
      this.logger.error('Failed to archive old logs:', error);
      throw error;
    }
  }

  /**
   * Get audit logs for a specific user
   */
  async getLogsByUser(
    userId: string,
    limit: number = 100,
  ): Promise<AuditLog[]> {
    return await this.auditLogRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get audit logs for a specific group
   */
  async getLogsByGroup(
    groupId: string,
    limit: number = 100,
  ): Promise<AuditLog[]> {
    return await this.auditLogRepository.find({
      where: { groupId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }
}
