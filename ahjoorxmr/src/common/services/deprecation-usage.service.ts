import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThan } from 'typeorm';
import { AuditLog } from '../../audit/entities/audit-log.entity';

@Injectable()
export class DeprecationUsageService {
  constructor(
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
  ) {}

  async getV1UsageStats(): Promise<{
    totalCalls: number;
    byRoute: Record<string, number>;
    byUser: Record<string, number>;
    generatedAt: string;
  }> {
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const logs = await this.auditLogRepository.find({
      where: {
        timestamp: MoreThan(since),
        action: 'V1_API_CALL',
      },
      select: ['userId', 'resource', 'metadata'],
    });

    const byRoute: Record<string, number> = {};
    const byUser: Record<string, number> = {};

    for (const log of logs) {
      const route = log.metadata?.route ?? log.resource;
      byRoute[route] = (byRoute[route] ?? 0) + 1;

      const user = log.userId ?? 'anonymous';
      byUser[user] = (byUser[user] ?? 0) + 1;
    }

    return {
      totalCalls: logs.length,
      byRoute,
      byUser,
      generatedAt: new Date().toISOString(),
    };
  }
}
