import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Group } from './entities/group.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { WinstonLogger } from '../common/logger/winston.logger';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import { GroupStatus } from './entities/group-status.enum';
import { NotificationsService } from '../notification/notifications.service';
import { NotificationType } from '../notification/notification-type.enum';
import { StellarService } from '../stellar/stellar.service';

/**
 * Service responsible for managing ROSCA group operations.
 * Handles business logic for creating, reading, and updating groups.
 * Does NOT interact with smart contracts — that is handled by the Stellar service.
 */
@Injectable()
export class GroupsService {
  constructor(
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    @InjectRepository(Membership)
    private readonly membershipRepository: Repository<Membership>,
    private readonly logger: WinstonLogger,
    private readonly notificationsService: NotificationsService,
    private readonly stellarService: StellarService,
  ) {}

  /**
   * Creates a new ROSCA group with status PENDING.
   * The adminWallet is taken from the authenticated user's wallet (passed in, not from DTO).
   *
   * @param createGroupDto - Group creation data
   * @param adminWallet - Wallet address of the authenticated admin user
   * @returns The created Group entity
   */
  async createGroup(
    createGroupDto: CreateGroupDto,
    adminWallet: string,
  ): Promise<Group> {
    this.logger.log(
      `Creating group "${createGroupDto.name}" for admin ${adminWallet}`,
      'GroupsService',
    );

    try {
      const group = this.groupRepository.create({
        ...createGroupDto,
        adminWallet,
        status: GroupStatus.PENDING,
        currentRound: 0,
        contractAddress: createGroupDto.contractAddress ?? null,
      });

      const savedGroup = await this.groupRepository.save(group);

      this.logger.log(
        `Group created with id ${savedGroup.id} for admin ${adminWallet}`,
        'GroupsService',
      );

      return savedGroup;
    } catch (error) {
      this.logger.error(
        `Failed to create group for admin ${adminWallet}: ${error.message}`,
        error.stack,
        'GroupsService',
      );
      throw error;
    }
  }

  /**
   * Returns a paginated list of all ROSCA groups ordered by creation date (newest first).
   * Soft-deleted groups are excluded by default unless includeArchived is true.
   *
   * @param page - Page number (1-indexed)
   * @param limit - Number of items per page
   * @param includeArchived - Whether to include soft-deleted groups
   * @param filter - Optional filter: 'stale' to return only stale groups
   * @returns Paginated result with data, total count, page, and limit
   */
  async findAll(
    page: number = 1,
    limit: number = 10,
    includeArchived: boolean = false,
    filter?: string,
  ): Promise<{ data: Group[]; total: number; page: number; limit: number }> {
    this.logger.log(
      `Fetching groups page=${page} limit=${limit} includeArchived=${includeArchived} filter=${filter}`,
      'GroupsService',
    );

    try {
      const skip = (page - 1) * limit;

      const qb = this.groupRepository
        .createQueryBuilder('group')
        .orderBy('group.createdAt', 'DESC')
        .skip(skip)
        .take(limit);

      if (includeArchived) {
        qb.withDeleted();
      }

      // Apply stale filter if requested
      if (filter === 'stale') {
        qb.andWhere('group.staleAt IS NOT NULL');
      }

      const [data, total] = await qb.getManyAndCount();

      this.logger.log(
        `Found ${total} group(s); returning page ${page}`,
        'GroupsService',
      );

      return { data, total, page, limit };
    } catch (error) {
      this.logger.error(
        `Failed to fetch groups: ${error.message}`,
        error.stack,
        'GroupsService',
      );
      throw error;
    }
  }

  /**
   * Returns full group details including its members.
   *
   * @param id - The UUID of the group
   * @returns The Group entity with populated memberships
   * @throws NotFoundException if the group doesn't exist
   */
  async findOne(id: string): Promise<Group> {
    this.logger.log(`Fetching group ${id}`, 'GroupsService');

    try {
      const group = await this.groupRepository.findOne({
        where: { id },
        relations: ['memberships'],
      });

      if (!group) {
        this.logger.warn(`Group ${id} not found`, 'GroupsService');
        throw new NotFoundException(`Group with id ${id} not found`);
      }

      return group;
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      this.logger.error(
        `Failed to fetch group ${id}: ${error.message}`,
        error.stack,
        'GroupsService',
      );
      throw error;
    }
  }

  /**
   * Updates group metadata. Only allowed when the group is in PENDING status.
   * Throws BadRequestException if the group is ACTIVE or COMPLETED.
   *
   * @param id - The UUID of the group
   * @param updateGroupDto - Fields to update
   * @param requestingAdminWallet - Wallet address of the requesting user (must be group admin)
   * @returns The updated Group entity
   * @throws NotFoundException if the group doesn't exist
   * @throws BadRequestException if the group is not PENDING
   * @throws ForbiddenException if the requester is not the group admin
   */
  async update(
    id: string,
    updateGroupDto: UpdateGroupDto,
    requestingAdminWallet: string,
  ): Promise<Group> {
    this.logger.log(
      `Updating group ${id} by admin ${requestingAdminWallet}`,
      'GroupsService',
    );

    try {
      const group = await this.groupRepository.findOne({ where: { id } });

      if (!group) {
        this.logger.warn(`Group ${id} not found for update`, 'GroupsService');
        throw new NotFoundException(`Group with id ${id} not found`);
      }

      if (group.adminWallet !== requestingAdminWallet) {
        this.logger.warn(
          `Admin wallet mismatch: ${requestingAdminWallet} is not the admin of group ${id}`,
          'GroupsService',
        );
        throw new ForbiddenException(
          'Only the group admin can update this group',
        );
      }

      if (group.status !== GroupStatus.PENDING) {
        this.logger.warn(
          `Cannot update group ${id} with status ${group.status}`,
          'GroupsService',
        );
        throw new BadRequestException(
          `Cannot update group metadata after it becomes ${group.status}. Only PENDING groups can be updated.`,
        );
      }

      Object.assign(group, updateGroupDto);
      const savedGroup = await this.groupRepository.save(group);

      this.logger.log(`Group ${id} updated successfully`, 'GroupsService');

      return savedGroup;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof BadRequestException ||
        error instanceof ForbiddenException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to update group ${id}: ${error.message}`,
        error.stack,
        'GroupsService',
      );
      throw error;
    }
  }

  /**
   * Returns all groups that the authenticated user (by userId) belongs to as a member.
   * Excludes soft-deleted groups.
   *
   * @param userId - The UUID of the authenticated user
   * @returns Array of Group entities the user is a member of
   */
  async findMyGroups(userId: string): Promise<Group[]> {
    this.logger.log(`Fetching groups for user ${userId}`, 'GroupsService');

    try {
      const memberships = await this.membershipRepository.find({
        where: { userId },
        relations: ['group'],
      });

      const groups = memberships
        .map((m) => m.group)
        .filter((g) => g && !g.deletedAt);

      this.logger.log(
        `Found ${groups.length} group(s) for user ${userId}`,
        'GroupsService',
      );

      return groups;
    } catch (error) {
      this.logger.error(
        `Failed to fetch groups for user ${userId}: ${error.message}`,
        error.stack,
        'GroupsService',
      );
      throw error;
    }
  }

  /**
   * Soft-deletes a group by setting deletedAt timestamp.
   * Only the group admin can delete the group.
   *
   * @param id - The UUID of the group
   * @param adminWallet - Wallet address of the requesting admin
   * @throws NotFoundException if the group doesn't exist
   * @throws ForbiddenException if the requester is not the group admin
   */
  async softDelete(id: string, adminWallet: string): Promise<void> {
    this.logger.log(
      `Soft-deleting group ${id} by admin ${adminWallet}`,
      'GroupsService',
    );

    const group = await this.groupRepository.findOne({ where: { id } });

    if (!group) {
      this.logger.warn(`Group ${id} not found for deletion`, 'GroupsService');
      throw new NotFoundException(`Group with id ${id} not found`);
    }

    if (group.adminWallet !== adminWallet) {
      this.logger.warn(
        `Admin wallet mismatch: ${adminWallet} is not the admin of group ${id}`,
        'GroupsService',
      );
      throw new ForbiddenException(
        'Only the group admin can delete this group',
      );
    }

    await this.groupRepository.softDelete(id);

    this.logger.log(`Group ${id} soft-deleted successfully`, 'GroupsService');
  }

  /**
   * Activates a PENDING group if all conditions are met.
   * Only the group admin can activate the group.
   * The group must have enough members to meet the minimum requirement.
   *
   * @param groupId - The UUID of the group to activate
   * @param adminWallet - Wallet address of the requesting admin
   * @returns The updated Group entity with status ACTIVE
   * @throws NotFoundException if the group doesn't exist
   * @throws ForbiddenException if the requester is not the group admin
   * @throws BadRequestException if the group is not PENDING or doesn't have enough members
   */
  async activateGroup(groupId: string, adminWallet: string): Promise<Group> {
    this.logger.log(
      `Activating group ${groupId} by admin ${adminWallet}`,
      'GroupsService',
    );

    try {
      // 1. Fetch group by ID
      const group = await this.groupRepository.findOne({
        where: { id: groupId },
        relations: ['memberships'],
      });

      if (!group) {
        this.logger.warn(`Group ${groupId} not found`, 'GroupsService');
        throw new NotFoundException('Group not found');
      }

      // 2. Check adminWallet === group.adminWallet
      if (group.adminWallet !== adminWallet) {
        this.logger.warn(
          `Admin wallet mismatch: ${adminWallet} is not the admin of group ${groupId}`,
          'GroupsService',
        );
        throw new ForbiddenException(
          'Only the group admin can activate this group',
        );
      }

      // 3. Check group.status === PENDING
      if (group.status !== GroupStatus.PENDING) {
        this.logger.warn(
          `Cannot activate group ${groupId} with status ${group.status}`,
          'GroupsService',
        );
        throw new BadRequestException('Group is not in a pending state');
      }

      // 4. Check group.members.length >= group.minMembers
      const memberCount = group.memberships?.length || 0;
      if (memberCount < group.minMembers) {
        this.logger.warn(
          `Group ${groupId} has ${memberCount} members but requires ${group.minMembers}`,
          'GroupsService',
        );
        throw new BadRequestException('Group does not have enough members');
      }

      // 5. Set group.status = ACTIVE
      group.status = GroupStatus.ACTIVE;

      // 6. Set group.currentRound = 1
      group.currentRound = 1;

      // 7. If RoundsService exists, initialize the first round
      // (RoundsService does not exist in this codebase, so we skip this step)

      // 8. Persist and return the updated group
      const savedGroup = await this.groupRepository.save(group);

      try {
        const contractAddress =
          await this.stellarService.deployRoscaContract(savedGroup);
        savedGroup.contractAddress = contractAddress;
        await this.groupRepository.save(savedGroup);
        this.logger.log(
          `Group ${groupId} activated and contract deployed at ${contractAddress}`,
          'GroupsService',
        );
      } catch (deployError) {
        savedGroup.status = GroupStatus.PENDING;
        savedGroup.currentRound = 0;
        await this.groupRepository.save(savedGroup);
        this.logger.error(
          `Contract deployment failed for group ${groupId}: ${
            (deployError as Error).message
          }`,
          (deployError as Error).stack,
          'GroupsService',
        );
        throw new BadRequestException(
          'Failed to deploy on-chain contract; activation rolled back',
        );
      }

      return savedGroup;
    } catch (error) {
      if (
        error instanceof NotFoundException ||
        error instanceof ForbiddenException ||
        error instanceof BadRequestException
      ) {
        throw error;
      }
      this.logger.error(
        `Failed to activate group ${groupId}: ${error.message}`,
        error.stack,
        'GroupsService',
      );
      throw error;
    }
  }

  /**
   * Advances the group to the next round.
   * Only the group admin can advance a round.
   * All members must have paid their current round contribution.
   * If currentRound exceeds totalRounds, the group is marked as COMPLETED.
   *
   * @param groupId - The UUID of the group
   * @param adminWallet - Wallet address of the requesting admin
   * @returns The updated Group entity
   * @throws NotFoundException if the group doesn't exist
   * @throws ForbiddenException if the requester is not the group admin
   * @throws BadRequestException if the group is not ACTIVE or members haven't paid
   */
  async advanceRound(groupId: string, adminWallet: string): Promise<Group> {
    this.logger.log(
      `Advancing round for group ${groupId} by admin ${adminWallet}`,
      'GroupsService',
    );

    const group = await this.groupRepository.findOne({
      where: { id: groupId },
      relations: ['memberships'],
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    if (group.adminWallet !== adminWallet) {
      throw new ForbiddenException('Only the group admin can advance rounds');
    }

    if (group.status !== GroupStatus.ACTIVE) {
      throw new BadRequestException('Group must be ACTIVE to advance rounds');
    }

    const unpaidMembers =
      group.memberships?.filter((m) => !m.hasPaidCurrentRound) || [];

    if (unpaidMembers.length > 0) {
      throw new BadRequestException(
        'All members must pay before advancing to the next round',
      );
    }

    group.currentRound += 1;

    // Clear stale flag when group is updated
    if (group.staleAt) {
      group.staleAt = null;
      this.logger.log(
        `Cleared stale flag for group ${groupId} during round advance`,
        'GroupsService',
      );
    }

    if (group.currentRound > group.totalRounds) {
      group.status = GroupStatus.COMPLETED;
      this.logger.log(`Group ${groupId} marked as COMPLETED`, 'GroupsService');
    } else {
      // Reset payment flags for new round
      for (const membership of group.memberships || []) {
        membership.hasPaidCurrentRound = false;
        await this.membershipRepository.save(membership);
      }

      // Send notifications
      for (const membership of group.memberships || []) {
        await this.notificationsService.notify({
          userId: membership.userId,
          type: NotificationType.ROUND_OPENED,
          title: 'New Round Started',
          body: `Round ${group.currentRound} has started for group "${group.name}"`,
          metadata: {
            groupId: group.id,
            round: group.currentRound,
          },
        });
      }
    }

    const savedGroup = await this.groupRepository.save(group);

    this.logger.log(
      `Group ${groupId} advanced to round ${savedGroup.currentRound}`,
      'GroupsService',
    );

    return savedGroup;
  }

  /**
   * Retrieves the on-chain contract state for a specific group.
   * Calls the Stellar service to fetch the current state from the smart contract.
   *
   * @param groupId - The UUID of the group
   * @returns The on-chain contract state
   * @throws NotFoundException if the group doesn't exist
   * @throws BadRequestException if the group has no contract address
   */
  async getContractState(groupId: string): Promise<unknown> {
    this.logger.log(
      `Fetching contract state for group ${groupId}`,
      'GroupsService',
    );

    const group = await this.groupRepository.findOne({
      where: { id: groupId },
    });

    if (!group) {
      throw new NotFoundException('Group not found');
    }

    if (!group.contractAddress) {
      throw new BadRequestException(
        'Group has no contract address. Contract may not be deployed yet.',
      );
    }

    try {
      const state = await this.stellarService.getGroupState(
        group.contractAddress,
      );
      this.logger.log(
        `Successfully fetched contract state for group ${groupId}`,
        'GroupsService',
      );
      return state;
    } catch (error) {
      this.logger.error(
        `Failed to fetch contract state for group ${groupId}: ${error.message}`,
        error.stack,
        'GroupsService',
      );
      throw error;
    }
  }
}
