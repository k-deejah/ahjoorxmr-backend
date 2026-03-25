import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Group } from '../../groups/entities/group.entity';
import { Membership } from '../../memberships/entities/membership.entity';

@Injectable()
export class GroupStatusService {
  private readonly logger = new Logger(GroupStatusService.name);

  constructor(
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    @InjectRepository(Membership)
    private readonly membershipRepository: Repository<Membership>,
  ) {}

  /**
   * Check and update group statuses based on business rules
   */
  async updateGroupStatuses(): Promise<number> {
    let updatedCount = 0;

    try {
      // Get all groups that are not completed
      const groups = await this.groupRepository.find({
        where: [{ status: 'PENDING' as any }, { status: 'ACTIVE' as any }],
      });

      for (const group of groups) {
        const updated = await this.checkAndUpdateGroupStatus(group);
        if (updated) {
          updatedCount++;
        }
      }

      this.logger.log(`Updated ${updatedCount} group statuses`);
      return updatedCount;
    } catch (error) {
      this.logger.error('Failed to update group statuses:', error);
      throw error;
    }
  }

  /**
   * Check and update a single group's status
   */
  private async checkAndUpdateGroupStatus(group: Group): Promise<boolean> {
    let statusChanged = false;

    // Check if group should transition from PENDING to ACTIVE
    if (group.status === 'PENDING') {
      const memberCount = await this.membershipRepository.count({
        where: { groupId: group.id },
      });

      if (memberCount >= group.minMembers && group.contractAddress) {
        group.status = 'ACTIVE' as any;
        statusChanged = true;
        this.logger.log(
          `Group ${group.name} (${group.id}) transitioned to ACTIVE`,
        );
      }
    }

    // Check if group should transition from ACTIVE to COMPLETED
    if (group.status === 'ACTIVE') {
      if (group.currentRound >= group.totalRounds) {
        group.status = 'COMPLETED' as any;
        statusChanged = true;
        this.logger.log(
          `Group ${group.name} (${group.id}) transitioned to COMPLETED`,
        );
      }
    }

    // Save if status changed
    if (statusChanged) {
      await this.groupRepository.save(group);
    }

    return statusChanged;
  }

  /**
   * Check for groups that may need attention (e.g., inactive for too long)
   */
  async checkInactiveGroups(): Promise<Group[]> {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const inactiveGroups = await this.groupRepository
      .createQueryBuilder('group')
      .where('group.status = :status', { status: 'PENDING' })
      .andWhere('group.createdAt < :date', { date: thirtyDaysAgo })
      .getMany();

    if (inactiveGroups.length > 0) {
      this.logger.warn(
        `Found ${inactiveGroups.length} groups pending for more than 30 days`,
      );
    }

    return inactiveGroups;
  }
}
