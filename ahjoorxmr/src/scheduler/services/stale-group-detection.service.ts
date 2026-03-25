import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { Group } from '../../groups/entities/group.entity';
import { GroupStatus } from '../../groups/entities/group-status.enum';
import { NotificationsService } from '../../notification/notifications.service';
import { NotificationType } from '../../notification/notification-type.enum';

/**
 * Service responsible for detecting and flagging stale groups.
 * A group is considered stale if it's ACTIVE but hasn't been updated
 * within the configured MAX_STALE_GROUP_DAYS threshold.
 */
@Injectable()
export class StaleGroupDetectionService {
  private readonly logger = new Logger(StaleGroupDetectionService.name);
  private readonly maxStaleDays: number;

  constructor(
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    private readonly notificationsService: NotificationsService,
    private readonly configService: ConfigService,
  ) {
    this.maxStaleDays = this.configService.get<number>(
      'MAX_STALE_GROUP_DAYS',
      7,
    );
  }

  /**
   * Detects and flags stale groups.
   * Returns the number of groups flagged as stale.
   */
  async detectAndFlagStaleGroups(): Promise<number> {
    this.logger.log(
      `Starting stale group detection (threshold: ${this.maxStaleDays} days)`,
    );

    const staleThreshold = new Date();
    staleThreshold.setDate(staleThreshold.getDate() - this.maxStaleDays);

    try {
      // Find ACTIVE groups that haven't been updated within the threshold
      // and are not already flagged as stale
      const staleGroups = await this.groupRepository.find({
        where: {
          status: GroupStatus.ACTIVE,
          updatedAt: LessThan(staleThreshold),
          staleAt: null,
        },
        relations: ['memberships'],
      });

      this.logger.log(`Found ${staleGroups.length} stale group(s)`);

      let flaggedCount = 0;

      for (const group of staleGroups) {
        try {
          // Flag the group as stale
          group.staleAt = new Date();
          await this.groupRepository.save(group);

          // Send SYSTEM_ALERT notification to the admin
          await this.notificationsService.notify({
            userId: group.adminWallet,
            type: NotificationType.SYSTEM_ALERT,
            title: 'Stale Group Detected',
            body: `Group "${group.name}" has not been updated in ${this.maxStaleDays} days. Please review and take action.`,
            metadata: {
              groupId: group.id,
              groupName: group.name,
              lastUpdated: group.updatedAt.toISOString(),
              staleDays: this.maxStaleDays,
            },
          });

          this.logger.log(
            `Flagged group ${group.id} (${group.name}) as stale and notified admin ${group.adminWallet}`,
          );

          flaggedCount++;
        } catch (error) {
          this.logger.error(
            `Failed to flag group ${group.id} as stale: ${error.message}`,
            error.stack,
          );
        }
      }

      this.logger.log(
        `Stale group detection completed. Flagged ${flaggedCount} group(s)`,
      );

      return flaggedCount;
    } catch (error) {
      this.logger.error(
        `Failed to detect stale groups: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  /**
   * Clears the staleAt flag for a specific group.
   * Called when a group is updated (e.g., round advanced or completed).
   */
  async clearStaleFlag(groupId: string): Promise<void> {
    try {
      const group = await this.groupRepository.findOne({
        where: { id: groupId },
      });

      if (group && group.staleAt) {
        group.staleAt = null;
        await this.groupRepository.save(group);
        this.logger.log(`Cleared stale flag for group ${groupId}`);
      }
    } catch (error) {
      this.logger.error(
        `Failed to clear stale flag for group ${groupId}: ${error.message}`,
        error.stack,
      );
    }
  }
}
