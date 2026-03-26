import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Group } from '../../groups/entities/group.entity';
import { GroupStatus } from '../../groups/entities/group-status.enum';
import { Membership } from '../../memberships/entities/membership.entity';
import { MembershipStatus } from '../../memberships/entities/membership-status.enum';
import { NotificationsService } from '../../notification/notifications.service';
import { NotificationType } from '../../notification/notification-type.enum';

export interface RoundAdvanceResult {
  advanced: number;
  reminded: number;
  errors: number;
}

@Injectable()
export class RoundAdvanceService {
  private readonly logger = new Logger(RoundAdvanceService.name);

  constructor(
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    @InjectRepository(Membership)
    private readonly membershipRepository: Repository<Membership>,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Main entry point called by the cron job.
   * Finds all ACTIVE groups whose round deadline has passed (including grace period),
   * advances groups where all members have paid, and sends reminders otherwise.
   */
  async processDeadlinedGroups(): Promise<RoundAdvanceResult> {
    const gracePeriodHours = this.configService.get<number>(
      'ROUND_GRACE_PERIOD_HOURS',
      0,
    );

    const now = new Date();
    // Deadline = updatedAt + roundDuration (seconds) + grace period
    // We query groups where updatedAt < now - roundDuration - gracePeriod
    // Since roundDuration varies per group we fetch all ACTIVE groups and filter in-memory.
    const activeGroups = await this.groupRepository.find({
      where: { status: GroupStatus.ACTIVE },
      relations: ['memberships'],
    });

    const result: RoundAdvanceResult = { advanced: 0, reminded: 0, errors: 0 };

    for (const group of activeGroups) {
      try {
        if (!this.isDeadlinePassed(group, now, gracePeriodHours)) {
          continue;
        }

        const activeMembers = (group.memberships ?? []).filter(
          (m) => m.status === MembershipStatus.ACTIVE,
        );

        const unpaidMembers = activeMembers.filter(
          (m) => !m.hasPaidCurrentRound,
        );

        if (unpaidMembers.length === 0) {
          await this.advanceGroupRound(group);
          result.advanced++;
        } else {
          await this.sendPaymentReminders(group, unpaidMembers);
          result.reminded++;
        }
      } catch (error) {
        this.logger.error(
          `Failed to process group ${group.id}: ${(error as Error).message}`,
          (error as Error).stack,
        );
        result.errors++;
      }
    }

    return result;
  }

  /**
   * Returns true if the group's round deadline (+ grace period) has passed.
   * roundDuration is stored in seconds.
   */
  isDeadlinePassed(group: Group, now: Date, gracePeriodHours: number): boolean {
    const deadlineMs =
      group.updatedAt.getTime() +
      group.roundDuration * 1000 +
      gracePeriodHours * 3600 * 1000;
    return now.getTime() >= deadlineMs;
  }

  /**
   * Advances the group to the next round and resets member payment flags.
   * Idempotent: if currentRound already advanced this tick, the save is a no-op.
   */
  private async advanceGroupRound(group: Group): Promise<void> {
    this.logger.log(
      `Auto-advancing group ${group.id} from round ${group.currentRound}`,
    );

    group.currentRound += 1;

    if (group.staleAt) {
      group.staleAt = null;
    }

    if (group.currentRound > group.totalRounds) {
      group.status = GroupStatus.COMPLETED;
      this.logger.log(`Group ${group.id} marked COMPLETED after auto-advance`);
    } else {
      // Reset payment flags for new round
      const activeMembers = (group.memberships ?? []).filter(
        (m) => m.status === MembershipStatus.ACTIVE,
      );

      for (const membership of activeMembers) {
        membership.hasPaidCurrentRound = false;
      }
      await this.membershipRepository.save(activeMembers);

      // Notify all active members
      const notifications = activeMembers.map((m) => ({
        userId: m.userId,
        type: NotificationType.ROUND_OPENED,
        title: 'New Round Started',
        body: `Round ${group.currentRound} has started for group "${group.name}"`,
        metadata: { groupId: group.id, round: group.currentRound },
        idempotencyKey: `${group.id}-${group.currentRound}-${m.userId}-ROUND_OPENED`,
      }));

      await this.notificationsService.notifyBatch(notifications);
    }

    await this.groupRepository.save(group);
  }

  /**
   * Sends PAYMENT_REMINDER notifications to unpaid members.
   * Uses idempotency keys scoped to the current round so reminders are not duplicated
   * if the cron fires multiple times within the same minute.
   */
  private async sendPaymentReminders(
    group: Group,
    unpaidMembers: Membership[],
  ): Promise<void> {
    this.logger.log(
      `Sending payment reminders for group ${group.id}, round ${group.currentRound} (${unpaidMembers.length} unpaid)`,
    );

    const notifications = unpaidMembers.map((m) => ({
      userId: m.userId,
      type: NotificationType.PAYMENT_REMINDER,
      title: 'Payment Reminder',
      body: `Your contribution for round ${group.currentRound} of group "${group.name}" is overdue. Please pay as soon as possible.`,
      metadata: {
        groupId: group.id,
        round: group.currentRound,
        groupName: group.name,
      },
      // Idempotency key is per-group, per-round, per-user — prevents duplicate reminders
      idempotencyKey: `${group.id}-${group.currentRound}-${m.userId}-PAYMENT_REMINDER`,
    }));

    await this.notificationsService.notifyBatch(notifications);
  }
}
