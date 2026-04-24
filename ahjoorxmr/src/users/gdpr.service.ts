import {
  Injectable,
  Logger,
  TooManyRequestsException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { createHash } from 'crypto';
import { User } from './entities/user.entity';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { GroupStatus } from '../groups/entities/group-status.enum';
import { Group } from '../groups/entities/group.entity';
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
    @InjectRepository(Membership)
    private readonly membershipRepository: Repository<Membership>,
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    @InjectQueue(GDPR_QUEUE_NAME)
    private readonly gdprQueue: Queue,
    private readonly redisService: RedisService,
  ) {}

  async requestDataExport(userId: string, ipAddress: string): Promise<void> {
    // Rate-limit: 1 export per 30 days
    const exportCooldownKey = `gdpr:export:cooldown:${userId}`;
    const onCooldown = await this.redisService.exists(exportCooldownKey);
    if (onCooldown) {
      const ttl = await this.redisService.ttl(exportCooldownKey);
      const daysLeft = Math.ceil(ttl / 86400);
      throw new TooManyRequestsException(
        `Data export already requested. Try again in ${daysLeft} day(s).`,
      );
    }

    await this.redisService.setWithExpiry(exportCooldownKey, '1', ERASURE_COOLDOWN_SECONDS);

    await this.auditLogRepository.save(
      this.auditLogRepository.create({
        userId,
        action: 'DATA_EXPORT_REQUESTED',
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
    // Block erasure if user is an active payout beneficiary
    await this.assertNotActiveBeneficiary(userId);

    const cooldownKey = `gdpr:erasure:cooldown:${userId}`;
    const onCooldown = await this.redisService.exists(cooldownKey);
    if (onCooldown) {
      const ttl = await this.redisService.ttl(cooldownKey);
      const daysLeft = Math.ceil(ttl / 86400);
      throw new TooManyRequestsException(
        `Erasure request already submitted. Try again in ${daysLeft} day(s).`,
      );
    }

    await this.redisService.setWithExpiry(cooldownKey, '1', ERASURE_COOLDOWN_SECONDS);

    await this.auditLogRepository.save(
      this.auditLogRepository.create({
        userId,
        action: 'ERASURE_REQUEST',
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

  /**
   * Anonymizes PII fields per GDPR Art. 17.
   * email → deleted_<sha256>@erased.invalid
   * walletAddress → null
   * firstName/lastName → 'DELETED'
   */
  async anonymizeUser(userId: string): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) return;

    const emailHash = user.email
      ? createHash('sha256').update(user.email).digest('hex').slice(0, 16)
      : userId.replace(/-/g, '').slice(0, 16);

    await this.userRepository.update(userId, {
      email: `deleted_${emailHash}@erased.invalid`,
      walletAddress: `ERASED_${userId.replace(/-/g, '').slice(0, 8)}`,
      firstName: 'DELETED',
      lastName: 'DELETED',
      username: null,
      bio: null,
      avatarUrl: null,
      isActive: false,
    });

    this.logger.log(`User ${userId} anonymized`);
  }

  /**
   * Checks whether the user is the current beneficiary of any active group.
   * Throws 409 Conflict with a canEraseAfter timestamp if so.
   */
  private async assertNotActiveBeneficiary(userId: string): Promise<void> {
    // Find memberships where the user is the current payout recipient
    const memberships = await this.membershipRepository.find({ where: { userId } });

    for (const membership of memberships) {
      const group = await this.groupRepository.findOne({ where: { id: membership.groupId } });
      if (!group || group.status !== GroupStatus.ACTIVE) continue;

      // payoutOrder is 0-indexed; currentRound is 1-indexed
      const isCurrentBeneficiary = membership.payoutOrder === group.currentRound - 1;
      if (isCurrentBeneficiary && !membership.hasReceivedPayout) {
        // Estimate when the round ends (group.endDate or staleAt)
        const canEraseAfter = group.endDate ?? group.staleAt ?? null;
        throw new ConflictException({
          message: 'Cannot erase account while you are the current payout beneficiary.',
          canEraseAfter: canEraseAfter?.toISOString() ?? null,
        });
      }
    }
  }
}
