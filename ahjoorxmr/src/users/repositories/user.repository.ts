import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, FindOptionsWhere, FindManyOptions, IsNull } from 'typeorm';
import { User } from '../entities/user.entity';
import { MembershipStatus } from '../../memberships/entities/membership-status.enum';

/**
 * Base repository with common operations
 * Extends TypeORM Repository with custom business logic
 */
@Injectable()
export class UserRepository extends Repository<User> {
  constructor(
    @InjectRepository(User)
    private readonly repository: Repository<User>,
  ) {
    super(repository.target, repository.manager, repository.queryRunner);
  }

  /**
   * Find user by wallet address
   */
  async findByWalletAddress(walletAddress: string): Promise<User | null> {
    return this.repository.findOne({
      where: { walletAddress },
      relations: ['memberships'],
    });
  }

  /**
   * Find user by email
   */
  async findByEmail(email: string): Promise<User | null> {
    return this.repository.findOne({
      where: { email },
      relations: ['memberships'],
    });
  }

  /**
   * Find active users
   */
  async findActiveUsers(options?: FindManyOptions<User>): Promise<User[]> {
    return this.repository.find({
      ...options,
      where: {
        isActive: true,
        bannedAt: IsNull(),
        ...((options?.where as FindOptionsWhere<User>) || {}),
      },
    });
  }

  /**
   * Find verified users
   */
  async findVerifiedUsers(): Promise<User[]> {
    return this.repository.find({
      where: { isVerified: true },
    });
  }

  /**
   * Search users by name or email
   */
  async searchUsers(searchTerm: string, limit: number = 10): Promise<User[]> {
    return this.repository
      .createQueryBuilder('user')
      .where(
        'user.firstName ILIKE :search OR user.lastName ILIKE :search OR user.email ILIKE :search OR user.username ILIKE :search',
        { search: `%${searchTerm}%` },
      )
      .andWhere('user.isActive = :isActive', { isActive: true })
      .limit(limit)
      .getMany();
  }

  /**
   * Get user statistics
   */
  async getUserStats(userId: string): Promise<{
    totalGroups: number;
    activeGroups: number;
    totalContributions: number;
  }> {
    const user = await this.repository.findOne({
      where: { id: userId },
      relations: ['memberships', 'memberships.group'],
    });

    if (!user || !user.memberships) {
      return {
        totalGroups: 0,
        activeGroups: 0,
        totalContributions: 0,
      };
    }

    const activeGroups = user.memberships.filter(
      (m) => m.status === MembershipStatus.ACTIVE,
    ).length;

    const totalContributions = user.memberships.reduce(
      (sum, m) => sum + m.contributionsMade,
      0,
    );

    return {
      totalGroups: user.memberships.length,
      activeGroups,
      totalContributions,
    };
  }

  /**
   * Update last login
   */
  async updateLastLogin(userId: string, ipAddress?: string): Promise<void> {
    await this.repository.update(userId, {
      lastLoginAt: new Date(),
      ...(ipAddress && { lastLoginIp: ipAddress }),
    });
  }

  /**
   * Ban user
   */
  async banUser(userId: string, reason: string): Promise<User> {
    const user = await this.repository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    user.ban(reason);
    return this.repository.save(user);
  }

  /**
   * Unban user
   */
  async unbanUser(userId: string): Promise<User> {
    const user = await this.repository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    user.unban();
    return this.repository.save(user);
  }

  /**
   * Verify user
   */
  async verifyUser(userId: string): Promise<User> {
    const user = await this.repository.findOne({ where: { id: userId } });
    if (!user) {
      throw new Error('User not found');
    }

    user.verify();
    return this.repository.save(user);
  }

  /**
   * Get users with pagination
   */
  async findWithPagination(
    page: number = 1,
    limit: number = 10,
    filters?: Partial<User>,
  ): Promise<{
    users: User[];
    total: number;
    page: number;
    totalPages: number;
  }> {
    const skip = (page - 1) * limit;

    const [users, total] = await this.repository.findAndCount({
      where: filters as FindOptionsWhere<User>,
      skip,
      take: limit,
      order: { createdAt: 'DESC' },
    });

    return {
      users,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    };
  }

  /**
   * Soft delete user (mark as inactive)
   */
  async softDeleteUser(userId: string): Promise<void> {
    await this.repository.update(userId, {
      isActive: false,
      bannedAt: new Date(),
      banReason: 'Account deleted by user',
    });
  }
}
