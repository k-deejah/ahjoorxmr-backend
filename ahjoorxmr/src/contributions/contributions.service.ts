import {
  Injectable,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, QueryFailedError } from 'typeorm';
import { Contribution } from './entities/contribution.entity';
import { Group } from '../groups/entities/group.entity';
import { GroupStatus } from '../groups/entities/group-status.enum';
import { WinstonLogger } from '../common/logger/winston.logger';
import { CreateContributionDto } from './dto/create-contribution.dto';
import { StellarService } from '../stellar/stellar.service';
import { ConfigService } from '@nestjs/config';
import { GetContributionsQueryDto } from './dto/get-contributions-query.dto';

/**
 * Service responsible for managing contribution operations in ROSCA groups.
 * Handles business logic for recording and querying member contributions.
 */
@Injectable()
export class ContributionsService {
  constructor(
    @InjectRepository(Contribution)
    private readonly contributionRepository: Repository<Contribution>,
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    private readonly logger: WinstonLogger,
    private readonly stellarService: StellarService,
    private readonly configService: ConfigService,
  ) {}

  /**
   * Validates that a group exists and returns it.
   *
   * @param groupId - The UUID of the group to validate
   * @returns The Group entity
   * @throws BadRequestException if the group doesn't exist
   * @private
   */
  private async validateGroupExists(groupId: string): Promise<Group> {
    const group = await this.groupRepository.findOne({
      where: { id: groupId },
    });

    if (!group) {
      this.logger.warn(`Group ${groupId} not found`, 'ContributionsService');
      throw new BadRequestException('Invalid groupId or userId');
    }

    return group;
  }

  /**
   * Creates a new contribution record.
   * Validates that the group and user exist, checks for duplicate transaction hash,
   * validates round number matches current round, validates group is ACTIVE,
   * and creates the contribution record.
   *
   * @param createContributionDto - The contribution data
   * @returns The created Contribution entity
   * @throws BadRequestException if the group or user doesn't exist, round number is invalid, or group is not ACTIVE
   * @throws ConflictException if the transaction hash already exists
   */
  async createContribution(
    createContributionDto: CreateContributionDto,
  ): Promise<Contribution> {
    const { groupId, userId, transactionHash, roundNumber } =
      createContributionDto;

    this.logger.log(
      `Creating contribution for user ${userId} in group ${groupId} with transaction hash ${transactionHash}`,
      'ContributionsService',
    );

    try {
      // Validate group exists and fetch it
      const group = await this.validateGroupExists(groupId);

      // Validate group status is ACTIVE
      if (group.status !== GroupStatus.ACTIVE) {
        this.logger.warn(
          `Cannot create contribution for group ${groupId} with status ${group.status}`,
          'ContributionsService',
        );
        throw new BadRequestException(
          'Contributions can only be made to ACTIVE groups',
        );
      }

      // Validate round number matches current round
      if (roundNumber !== group.currentRound) {
        this.logger.warn(
          `Round number mismatch for group ${groupId}: provided ${roundNumber}, current ${group.currentRound}`,
          'ContributionsService',
        );
        throw new BadRequestException(
          'Contributions can only be made for the current round',
        );
      }

      // Verify contribution if enabled
      const shouldVerify = this.configService.get<boolean>(
        'VERIFY_CONTRIBUTIONS',
        true,
      );
      if (shouldVerify) {
        // Use group's contract address if available, fall back to global address
        if (group.contractAddress) {
          const isValid = await this.stellarService.verifyContributionForGroup(
            transactionHash,
            group.contractAddress,
          );
          if (!isValid) {
            this.logger.warn(
              `Contribution verification failed for transaction hash ${transactionHash} against group contract ${group.contractAddress}`,
              'ContributionsService',
            );
            throw new BadRequestException(
              'Transaction hash does not correspond to a valid contribution',
            );
          }
          this.logger.log(
            `Contribution verification successful for transaction hash ${transactionHash} against group contract ${group.contractAddress}`,
            'ContributionsService',
          );
        } else {
          // Fall back to global contract address
          this.logger.warn(
            `Group ${groupId} has no contractAddress, falling back to global CONTRACT_ADDRESS`,
            'ContributionsService',
          );
          const isValid = await this.stellarService.verifyContributionForGroup(
            transactionHash,
            null,
          );
          if (!isValid) {
            this.logger.warn(
              `Contribution verification failed for transaction hash ${transactionHash}`,
              'ContributionsService',
            );
            throw new BadRequestException(
              'Transaction hash does not correspond to a valid contribution',
            );
          }
          this.logger.log(
            `Contribution verification successful for transaction hash ${transactionHash}`,
            'ContributionsService',
          );
        }
      }

      // Check for duplicate transaction hash
      const existingContribution = await this.contributionRepository.findOne({
        where: { transactionHash },
      });

      if (existingContribution) {
        this.logger.warn(
          `Contribution with transaction hash ${transactionHash} already exists`,
          'ContributionsService',
        );
        throw new ConflictException(
          'Contribution with this transaction hash already exists',
        );
      }

      // Create contribution
      const contribution = this.contributionRepository.create(
        createContributionDto,
      );

      // Save to database
      const savedContribution =
        await this.contributionRepository.save(contribution);

      this.logger.log(
        `Contribution created with id ${savedContribution.id} for user ${userId} in group ${groupId}`,
        'ContributionsService',
      );

      return savedContribution;
    } catch (error) {
      // Re-throw known exceptions
      if (
        error instanceof BadRequestException ||
        error instanceof ConflictException
      ) {
        throw error;
      }

      // Handle database errors
      if (error instanceof QueryFailedError) {
        const pgError = error as any;

        // Unique constraint violation (duplicate transaction hash)
        if (pgError.code === '23505') {
          this.logger.error(
            `Unique constraint violation for transaction hash ${transactionHash}`,
            error.stack,
            'ContributionsService',
          );
          throw new ConflictException(
            'Contribution with this transaction hash already exists',
          );
        }

        // Foreign key violation (invalid groupId or userId)
        if (pgError.code === '23503') {
          this.logger.error(
            `Foreign key violation when creating contribution for user ${userId} in group ${groupId}`,
            error.stack,
            'ContributionsService',
          );
          throw new BadRequestException('Invalid groupId or userId');
        }
      }

      // Log and re-throw unexpected errors
      this.logger.error(
        `Failed to create contribution for user ${userId} in group ${groupId}: ${error.message}`,
        error.stack,
        'ContributionsService',
      );
      throw error;
    }
  }

  /**
   * Retrieves all contributions for a specific group with pagination, sorting, and filtering.
   *
   * @param groupId - The UUID of the group
   * @param query - The pagination and filter query parameters
   * @returns Paginated envelope containing contribution entities
   */
  async getGroupContributions(
    groupId: string,
    query: GetContributionsQueryDto,
  ): Promise<{
    data: Contribution[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const {
      page = 1,
      limit = 20,
      round,
      walletAddress,
      sortBy = 'timestamp',
      sortOrder = 'DESC',
    } = query;

    this.logger.log(
      `Querying contributions for group ${groupId} with pagination: page=${page}, limit=${limit}, sortBy=${sortBy}, sortOrder=${sortOrder}${round ? `, round=${round}` : ''}${walletAddress ? `, walletAddress=${walletAddress}` : ''}`,
      'ContributionsService',
    );

    const whereClause: any = { groupId };

    if (round !== undefined) {
      whereClause.roundNumber = round;
    }

    if (walletAddress) {
      whereClause.walletAddress = walletAddress;
    }

    const [data, total] = await this.contributionRepository.findAndCount({
      where: whereClause,
      order: { [sortBy]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    });

    const totalPages = Math.ceil(total / limit);

    this.logger.log(
      `Found ${data.length} contribution(s) (total ${total}) for group ${groupId}`,
      'ContributionsService',
    );

    return {
      data,
      total,
      page,
      limit,
      totalPages,
    };
  }

  /**
   * Retrieves all contributions for a specific group and round.
   *
   * @param groupId - The UUID of the group
   * @param round - The round number to query
   * @returns Array of Contribution entities (empty if none found)
   */
  async getRoundContributions(
    groupId: string,
    round: number,
  ): Promise<Contribution[]> {
    this.logger.log(
      `Querying contributions for group ${groupId} and round ${round}`,
      'ContributionsService',
    );

    const contributions = await this.contributionRepository.find({
      where: {
        groupId,
        roundNumber: round,
      },
      order: { timestamp: 'DESC' },
    });

    this.logger.log(
      `Found ${contributions.length} contribution(s) for group ${groupId} and round ${round}`,
      'ContributionsService',
    );

    return contributions;
  }

  /**
   * Retrieves all contributions for a specific user across all groups.
   *
   * @param userId - The UUID of the user
   * @returns Array of Contribution entities (empty if none found)
   */
  async getUserContributions(userId: string): Promise<Contribution[]> {
    this.logger.log(
      `Querying contributions for user ${userId}`,
      'ContributionsService',
    );

    const contributions = await this.contributionRepository.find({
      where: { userId },
      order: { timestamp: 'DESC' },
    });

    this.logger.log(
      `Found ${contributions.length} contribution(s) for user ${userId}`,
      'ContributionsService',
    );

    return contributions;
  }
}
