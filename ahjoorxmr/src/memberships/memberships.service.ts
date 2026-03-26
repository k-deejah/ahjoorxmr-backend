import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryFailedError } from 'typeorm';
import { Membership } from './entities/membership.entity';
import { Group } from '../groups/entities/group.entity';
import { WinstonLogger } from '../common/logger/winston.logger';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { UpdatePayoutOrderDto } from './dto/update-payout-order.dto';
import { MembershipStatus } from './entities/membership-status.enum';
import { NotificationsService } from '../notification/notifications.service';
import { NotificationType } from '../notification/notification-type.enum';
import { GroupStatus } from '../groups/entities/group-status.enum';

/**
 * Service responsible for managing membership operations in ROSCA groups.
 * Handles business logic for adding, removing, and listing group members.
 */
@Injectable()
export class MembershipsService {
  constructor(
    @InjectRepository(Membership)
    private readonly membershipRepository: Repository<Membership>,
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    private readonly logger: WinstonLogger,
    private readonly notificationsService: NotificationsService,
  ) {}

  /**
   * Validates that a group exists and is not in ACTIVE status.
   * Membership modifications are only allowed before a group becomes active.
   *
   * @param groupId - The UUID of the group to validate
   * @throws NotFoundException if the group doesn't exist
   * @throws BadRequestException if the group is already active
   * @private
   */
  private async validateGroupNotActive(groupId: string): Promise<Group> {
    const group = await this.groupRepository.findOne({
      where: { id: groupId },
    });

    if (!group) {
      this.logger.warn(`Group ${groupId} not found`, 'MembershipsService');
      throw new NotFoundException('Group not found');
    }

    if (group.status === 'ACTIVE') {
      this.logger.warn(
        `Attempted to modify memberships for active group ${groupId}`,
        'MembershipsService',
      );
      throw new BadRequestException(
        'Cannot modify memberships for an active group',
      );
    }

    return group;
  }

  /**
   * Calculates the next available payout order position for a new member.
   * Returns 0 if this is the first member, otherwise returns max(payoutOrder) + 1.
   * Returns null if the group uses RANDOM or ADMIN_DEFINED strategy.
   *
   * @param groupId - The UUID of the group
   * @returns The next sequential payout order position or null
   * @private
   */
  private async getNextPayoutOrder(groupId: string): Promise<number | null> {
    // Get the group to check its payout order strategy
    const group = await this.groupRepository.findOne({
      where: { id: groupId },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    // For RANDOM or ADMIN_DEFINED strategies, return null
    // Payout order will be assigned at activation time
    if (
      group.payoutOrderStrategy === 'RANDOM' ||
      group.payoutOrderStrategy === 'ADMIN_DEFINED'
    ) {
      return null;
    }

    // For SEQUENTIAL strategy, calculate next order
    const result = await this.membershipRepository
      .createQueryBuilder('membership')
      .select('MAX(membership.payoutOrder)', 'maxOrder')
      .where('membership.groupId = :groupId', { groupId })
      .getRawOne();

    const maxOrder = result?.maxOrder;
    return maxOrder !== null && maxOrder !== undefined ? maxOrder + 1 : 0;
  }

  /**
   * Adds a new member to a ROSCA group.
   * Validates that the group exists and is not active, checks for duplicate membership,
   * assigns the next available payout order, and creates the membership record.
   *
   * @param groupId - The UUID of the group to add the member to
   * @param createMembershipDto - The membership data (userId and walletAddress)
   * @returns The created Membership entity
   * @throws BadRequestException if the group is active or doesn't exist
   * @throws ConflictException if the user is already a member of the group
   */
  async addMember(
    groupId: string,
    createMembershipDto: CreateMembershipDto,
  ): Promise<Membership> {
    const { userId, walletAddress } = createMembershipDto;

    this.logger.log(
      `Adding member ${userId} to group ${groupId}`,
      'MembershipsService',
    );

    try {
      // Validate group exists and is not active
      const group = await this.validateGroupNotActive(groupId);

      // Enforce maxMembers cap
      const memberCount = await this.membershipRepository.count({
        where: { groupId },
      });

      if (memberCount >= group.maxMembers) {
        this.logger.warn(
          `Group ${groupId} is at capacity (${memberCount}/${group.maxMembers})`,
          'MembershipsService',
        );
        throw new BadRequestException(
          `Group has reached its maximum member capacity of ${group.maxMembers}`,
        );
      }

      // Check for duplicate membership
      const existingMembership = await this.membershipRepository.findOne({
        where: { groupId, userId },
      });

      if (existingMembership) {
        this.logger.warn(
          `User ${userId} is already a member of group ${groupId}`,
          'MembershipsService',
        );
        throw new ConflictException('User is already a member of this group');
      }

      // Calculate next available payout order (null for RANDOM/ADMIN_DEFINED)
      const payoutOrder = await this.getNextPayoutOrder(groupId);

      // Create membership with default values
      const membership = this.membershipRepository.create({
        groupId,
        userId,
        walletAddress,
        payoutOrder: payoutOrder as any, // Allow null for non-SEQUENTIAL strategies
        status: MembershipStatus.ACTIVE,
        hasReceivedPayout: false,
        hasPaidCurrentRound: false,
      });

      // Save to database
      const savedMembership = await this.membershipRepository.save(membership);

      this.logger.log(
        `Member ${userId} added to group ${groupId} with membership id ${savedMembership.id}`,
        'MembershipsService',
      );

      return savedMembership;
    } catch (error) {
      // Re-throw known exceptions
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      // Handle database errors
      if (error instanceof QueryFailedError) {
        const pgError = error as any;

        // Unique constraint violation (duplicate membership)
        if (pgError.code === '23505') {
          this.logger.error(
            `Unique constraint violation when adding member ${userId} to group ${groupId}`,
            error.stack,
            'MembershipsService',
          );
          throw new ConflictException('User is already a member of this group');
        }

        // Foreign key violation (invalid groupId or userId)
        if (pgError.code === '23503') {
          this.logger.error(
            `Foreign key violation when adding member ${userId} to group ${groupId}`,
            error.stack,
            'MembershipsService',
          );
          throw new BadRequestException('Invalid groupId or userId');
        }
      }

      // Log and re-throw unexpected errors
      this.logger.error(
        `Failed to add member ${userId} to group ${groupId}: ${error.message}`,
        error.stack,
        'MembershipsService',
      );
      throw error;
    }
  }

  /**
   * Removes a member from a ROSCA group.
   * Validates that the group exists and is not active, finds the membership,
   * and deletes it from the database.
   *
   * @param groupId - The UUID of the group to remove the member from
   * @param userId - The UUID of the user to remove
   * @throws BadRequestException if the group is active
   * @throws NotFoundException if the membership doesn't exist
   */
  async removeMember(groupId: string, userId: string): Promise<void> {
    this.logger.log(
      `Removing member ${userId} from group ${groupId}`,
      'MembershipsService',
    );

    try {
      // Validate group exists and is not active
      await this.validateGroupNotActive(groupId);

      // Find membership by groupId and userId
      const membership = await this.membershipRepository.findOne({
        where: { groupId, userId },
      });

      // Throw NotFoundException if membership doesn't exist
      if (!membership) {
        this.logger.warn(
          `Membership not found for user ${userId} in group ${groupId}`,
          'MembershipsService',
        );
        throw new NotFoundException('Membership not found');
      }

      // Delete membership from database
      await this.membershipRepository.remove(membership);

      this.logger.log(
        `Member ${userId} removed from group ${groupId} with membership id ${membership.id}`,
        'MembershipsService',
      );
    } catch (error) {
      // Re-throw known exceptions
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      // Log and re-throw unexpected errors
      this.logger.error(
        `Failed to remove member ${userId} from group ${groupId}: ${error.message}`,
        error.stack,
        'MembershipsService',
      );
      throw error;
    }
  }

  /**
   * Lists all members of a ROSCA group.
   * Returns all memberships for the specified group ordered by payout order.
   * Returns an empty array if the group has no members or doesn't exist.
   *
   * @param groupId - The UUID of the group to list members for
   * @returns Array of Membership entities ordered by payoutOrder ascending
   */
  async listMembers(groupId: string): Promise<Membership[]> {
    this.logger.log(
      `Listing members for group ${groupId}`,
      'MembershipsService',
    );

    try {
      // Query all memberships for groupId ordered by payoutOrder ASC
      const members = await this.membershipRepository.find({
        where: { groupId },
        order: { payoutOrder: 'ASC' },
      });

      this.logger.log(
        `Found ${members.length} members for group ${groupId}`,
        'MembershipsService',
      );

      return members;
    } catch (error) {
      // Log and re-throw unexpected errors
      this.logger.error(
        `Failed to list members for group ${groupId}: ${error.message}`,
        error.stack,
        'MembershipsService',
      );
      throw error;
    }
  }

  /**
   * Allows a member to leave a PENDING group (self-service).
   * Validates that the group is PENDING, finds the membership,
   * removes it, and re-sequences the payoutOrder for remaining members.
   *
   * @param groupId - The UUID of the group to leave
   * @param userId - The UUID of the user leaving
   * @throws BadRequestException if the group is ACTIVE or COMPLETED
   * @throws NotFoundException if the group or membership doesn't exist
   */
  async leaveGroup(groupId: string, userId: string): Promise<void> {
    this.logger.log(
      `User ${userId} attempting to leave group ${groupId}`,
      'MembershipsService',
    );

    try {
      // Find the group
      const group = await this.groupRepository.findOne({
        where: { id: groupId },
      });

      if (!group) {
        this.logger.warn(`Group ${groupId} not found`, 'MembershipsService');
        throw new NotFoundException('Group not found');
      }

      // Validate group is PENDING
      if (group.status !== GroupStatus.PENDING) {
        this.logger.warn(
          `User ${userId} attempted to leave non-PENDING group ${groupId} (status: ${group.status})`,
          'MembershipsService',
        );
        throw new BadRequestException(
          'Cannot leave a group that is ACTIVE or COMPLETED',
        );
      }

      // Find membership by groupId and userId
      const membership = await this.membershipRepository.findOne({
        where: { groupId, userId },
      });

      if (!membership) {
        this.logger.warn(
          `Membership not found for user ${userId} in group ${groupId}`,
          'MembershipsService',
        );
        throw new NotFoundException('Membership not found');
      }

      const departingPayoutOrder = membership.payoutOrder;

      // Delete membership from database
      await this.membershipRepository.remove(membership);

      // Re-sequence payoutOrder for remaining members
      const remainingMembers = await this.membershipRepository.find({
        where: { groupId },
        order: { payoutOrder: 'ASC' },
      });

      // Update payout order for members that came after the departing member
      for (const member of remainingMembers) {
        if (member.payoutOrder > departingPayoutOrder) {
          member.payoutOrder -= 1;
          await this.membershipRepository.save(member);
        }
      }

      // Send notification to the departing member
      await this.notificationsService.notify({
        userId,
        type: NotificationType.MEMBER_LEFT,
        title: 'Left Group',
        body: `You have left the group "${group.name}"`,
        metadata: {
          groupId,
          groupName: group.name,
        },
      });

      this.logger.log(
        `User ${userId} successfully left group ${groupId}`,
        'MembershipsService',
      );
    } catch (error) {
      // Re-throw known exceptions
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }

      // Log and re-throw unexpected errors
      this.logger.error(
        `Failed for user ${userId} to leave group ${groupId}: ${error.message}`,
        error.stack,
        'MembershipsService',
      );
      throw error;
    }
  }

  /**
   * Returns the membership scheduled to receive the payout for the current round.
   * Uses 0-indexed payoutOrder matching group.currentRound - 1.
   *
   * @param groupId - The UUID of the group
   * @returns The Membership entity for the current round's recipient
   * @throws NotFoundException if group doesn't exist or no member is scheduled
   * @throws BadRequestException if group is not ACTIVE
   */
  async getCurrentRecipient(groupId: string): Promise<Membership> {
    const group = await this.groupRepository.findOne({
      where: { id: groupId },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    if (group.status !== GroupStatus.ACTIVE) {
      throw new BadRequestException('Group must be ACTIVE to query current recipient');
    }

    const expectedPayoutOrder = group.currentRound - 1;

    const membership = await this.membershipRepository.findOne({
      where: { groupId, payoutOrder: expectedPayoutOrder },
    });

    if (!membership) {
      throw new NotFoundException(
        `No member scheduled for payout in round ${group.currentRound}`,
      );
    }

    return membership;
  }

  /**
   * Records a payout to a member.
   * Validates group is ACTIVE, enforces sequential round-based payout order,
   * member exists and hasn't received payout yet.
   * Marks member as paid and stores transaction hash.
   *
   * @param groupId - The UUID of the group
   * @param recipientUserId - The UUID of the recipient user
   * @param transactionHash - The blockchain transaction hash
   * @returns The updated Membership entity
   * @throws NotFoundException if group or membership doesn't exist
   * @throws BadRequestException if group is not ACTIVE or payout order is wrong
   * @throws ConflictException if member already received payout
   */
  async recordPayout(
    groupId: string,
    recipientUserId: string,
    transactionHash: string,
  ): Promise<Membership> {
    this.logger.log(
      `Recording payout for user ${recipientUserId} in group ${groupId}`,
      'MembershipsService',
    );

    const group = await this.groupRepository.findOne({
      where: { id: groupId },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    if (group.status !== GroupStatus.ACTIVE) {
      throw new BadRequestException('Group must be ACTIVE to record payouts');
    }

    const membership = await this.membershipRepository.findOne({
      where: { groupId, userId: recipientUserId },
    });

    if (!membership) {
      throw new NotFoundException('Membership not found');
    }

    if (membership.hasReceivedPayout) {
      throw new ConflictException('Member has already received payout');
    }

    // Enforce sequential round-based payout: payoutOrder must match currentRound - 1 (0-indexed)
    const expectedPayoutOrder = group.currentRound - 1;
    if (membership.payoutOrder !== expectedPayoutOrder) {
      throw new BadRequestException(
        `Payout order mismatch: member has payoutOrder ${membership.payoutOrder} but current round ${group.currentRound} expects payoutOrder ${expectedPayoutOrder}`,
      );
    }

    membership.hasReceivedPayout = true;
    membership.transactionHash = transactionHash;

    const savedMembership = await this.membershipRepository.save(membership);

    await this.notificationsService.notify({
      userId: recipientUserId,
      type: NotificationType.PAYOUT_RECEIVED,
      title: 'Payout Received',
      body: `You have received your payout from group "${group.name}"`,
      metadata: {
        groupId,
        transactionHash,
        amount: group.contributionAmount,
      },
    });

    this.logger.log(
      `Payout recorded for user ${recipientUserId} in group ${groupId}`,
      'MembershipsService',
    );

    return savedMembership;
  }
}
