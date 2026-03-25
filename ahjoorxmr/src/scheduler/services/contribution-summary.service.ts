import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, MoreThanOrEqual } from 'typeorm';
import { Contribution } from '../../contributions/entities/contribution.entity';
import { Group } from '../../groups/entities/group.entity';
import { Membership } from '../../memberships/entities/membership.entity';

interface ContributionSummary {
  groupId: string;
  groupName: string;
  totalContributions: number;
  totalAmount: string;
  memberCount: number;
  contributions: {
    userId: string;
    walletAddress: string;
    amount: string;
    roundNumber: number;
  }[];
}

@Injectable()
export class ContributionSummaryService {
  private readonly logger = new Logger(ContributionSummaryService.name);

  constructor(
    @InjectRepository(Contribution)
    private readonly contributionRepository: Repository<Contribution>,
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    @InjectRepository(Membership)
    private readonly membershipRepository: Repository<Membership>,
  ) {}

  /**
   * Generate weekly contribution summaries for all active groups
   */
  async generateWeeklySummaries(): Promise<ContributionSummary[]> {
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    try {
      // Get all active groups
      const groups = await this.groupRepository.find({
        where: { status: 'ACTIVE' as any },
      });

      const summaries: ContributionSummary[] = [];

      for (const group of groups) {
        // Get contributions for this group in the last week
        const contributions = await this.contributionRepository.find({
          where: {
            groupId: group.id,
            createdAt: MoreThanOrEqual(weekAgo),
          },
          relations: ['user'],
          order: { createdAt: 'DESC' },
        });

        // Get member count
        const memberCount = await this.membershipRepository.count({
          where: { groupId: group.id },
        });

        // Calculate total amount
        const totalAmount = contributions.reduce((sum, c) => {
          return sum + BigInt(c.amount);
        }, BigInt(0));

        summaries.push({
          groupId: group.id,
          groupName: group.name,
          totalContributions: contributions.length,
          totalAmount: totalAmount.toString(),
          memberCount,
          contributions: contributions.map((c) => ({
            userId: c.userId,
            walletAddress: c.walletAddress,
            amount: c.amount,
            roundNumber: c.roundNumber,
          })),
        });
      }

      this.logger.log(
        `Generated ${summaries.length} weekly contribution summaries`,
      );
      return summaries;
    } catch (error) {
      this.logger.error('Failed to generate weekly summaries:', error);
      throw error;
    }
  }

  /**
   * Send contribution summary to group members
   * In a real implementation, this would integrate with a notification service
   */
  async sendSummariesToMembers(
    summaries: ContributionSummary[],
  ): Promise<void> {
    for (const summary of summaries) {
      // Get all members of the group
      const memberships = await this.membershipRepository.find({
        where: { groupId: summary.groupId },
        relations: ['user'],
      });

      this.logger.log(
        `Sending summary for group ${summary.groupName} to ${memberships.length} members`,
      );

      // TODO: Integrate with notification service to send emails/push notifications
      // For now, just log the summary
      this.logger.debug(`Summary: ${JSON.stringify(summary, null, 2)}`);
    }
  }
}
