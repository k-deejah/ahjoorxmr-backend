import {
  Injectable,
  Logger,
  TooManyRequestsException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash } from 'crypto';
import { User } from './entities/user.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { RedisService } from '../common/redis/redis.service';
import { GDPR_QUEUE_NAME, GDPR_JOB_NAMES } from './gdpr.constants';

const ERASURE_COOLDOWN_SECONDS = 30 * 24 * 60 * 60; // 30 days

@Injectable()
export class GdprService {
  private readonly logger = new Logger(GdprService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(AuditLog)
    private readonly auditLogRepository: Repository<AuditLog>,
    @InjectQueue(GDPR_QUEUE_NAME)
    private readonly gdprQueue: Queue,
    private readonly redisService: RedisService,
  ) {}

  async requestDataExport(userId: string, ipAddress: string): Promise<void> {
    await this.auditLogRepository.save(
      this.auditLogRepository.create({
        userId,
        action: 'DATA_EXPORT',
        resource: 'USER',
        ipAddress,
        metadata: { requestedAt: new Date().toISOString() },
      }),
    );

    await this.gdprQueue.add(
      GDPR_JOB_NAMES.DATA_EXPORT,
      { userId },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    this.logger.log(`Data export queued for user ${userId}`);
  }

  async requestErasure(userId: string, ipAddress: string): Promise<void> {
    const cooldownKey = `gdpr:erasure:cooldown:${userId}`;
    const onCooldown = await this.redisService.exists(cooldownKey);

    if (onCooldown) {
      const ttl = await this.redisService.ttl(cooldownKey);
      const daysLeft = Math.ceil(ttl / 86400);
      throw new TooManyRequestsException(
        `Erasure request already submitted. Try again in ${daysLeft} day(s).`,
      );
    }

    await this.redisService.setWithExpiry(
      cooldownKey,
      '1',
      ERASURE_COOLDOWN_SECONDS,
    );

    await this.auditLogRepository.save(
      this.auditLogRepository.create({
        userId,
        action: 'DATA_ERASURE',
        resource: 'USER',
        ipAddress,
        metadata: { requestedAt: new Date().toISOString() },
      }),
    );

    await this.gdprQueue.add(
      GDPR_JOB_NAMES.RIGHT_TO_ERASURE,
      { userId },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );

    this.logger.log(`Erasure job queued for user ${userId}`);
  }

  async anonymizeUser(userId: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) return;

    const hashedEmail = user.email
      ? createHash('sha256').update(user.email).digest('hex')
      : null;

    await this.userRepository.update(userId, {
      email: hashedEmail,
      walletAddress: `REDACTED_${userId.slice(0, 8)}`,
      firstName: null,
      lastName: null,
      username: null,
      bio: null,
      avatarUrl: null,
      isActive: false,
    });

    this.logger.log(`User ${userId} anonymized`);
  }
}
