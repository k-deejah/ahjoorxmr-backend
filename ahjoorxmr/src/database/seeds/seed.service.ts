import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Group } from '../../groups/entities/group.entity';
import { Membership } from '../../memberships/entities/membership.entity';
import { Contribution } from '../../contributions/entities/contribution.entity';
import { UserFactory } from '../factories/user.factory';
import { GroupFactory } from '../factories/group.factory';
import { MembershipFactory } from '../factories/membership.factory';
import { ContributionFactory } from '../factories/contribution.factory';

/**
 * SeedService handles database seeding for development and testing.
 * Provides methods to populate the database with realistic sample data.
 */
@Injectable()
export class SeedService {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    @InjectRepository(Group)
    private readonly groupRepository: Repository<Group>,
    @InjectRepository(Membership)
    private readonly membershipRepository: Repository<Membership>,
    @InjectRepository(Contribution)
    private readonly contributionRepository: Repository<Contribution>,
    private readonly userFactory: UserFactory,
    private readonly groupFactory: GroupFactory,
    private readonly membershipFactory: MembershipFactory,
    private readonly contributionFactory: ContributionFactory,
  ) {}

  /**
   * Seeds the database with sample data.
   * This method is idempotent - it checks for existing data before seeding.
   */
  async seed(): Promise<void> {
    this.logger.log('Starting database seeding...');

    // Check if data already exists
    const userCount = await this.userRepository.count();
    if (userCount > 0) {
      this.logger.log('Database already contains data. Skipping seed.');
      return;
    }

    // Create users
    this.logger.log('Creating users...');
    const users = await this.seedUsers(10);
    this.logger.log(`Created ${users.length} users`);

    // Create groups
    this.logger.log('Creating groups...');
    const groups = await this.seedGroups(5, users);
    this.logger.log(`Created ${groups.length} groups`);

    // Create memberships
    this.logger.log('Creating memberships...');
    const memberships = await this.seedMemberships(groups, users);
    this.logger.log(`Created ${memberships.length} memberships`);

    // Create contributions
    this.logger.log('Creating contributions...');
    const contributions = await this.seedContributions(memberships);
    this.logger.log(`Created ${contributions.length} contributions`);

    this.logger.log('Database seeding completed successfully!');
  }

  /**
   * Clears all data from the database and re-seeds it.
   */
  async reset(): Promise<void> {
    this.logger.log('Resetting database...');

    // Delete in correct order to respect foreign key constraints
    await this.contributionRepository.delete({});
    await this.membershipRepository.delete({});
    await this.groupRepository.delete({});
    await this.userRepository.delete({});

    this.logger.log('Database cleared. Starting seed...');
    await this.seed();
  }

  /**
   * Seeds users into the database.
   */
  private async seedUsers(count: number): Promise<User[]> {
    const users: User[] = [];
    for (let i = 0; i < count; i++) {
      const user = this.userFactory.create();
      const savedUser = await this.userRepository.save(user);
      users.push(savedUser);
    }
    return users;
  }

  /**
   * Seeds groups into the database.
   */
  private async seedGroups(count: number, users: User[]): Promise<Group[]> {
    const groups: Group[] = [];
    for (let i = 0; i < count; i++) {
      const adminUser = users[i % users.length];
      const group = this.groupFactory.create(adminUser);
      const savedGroup = await this.groupRepository.save(group);
      groups.push(savedGroup);
    }
    return groups;
  }

  /**
   * Seeds memberships into the database.
   * Creates realistic group memberships with 3-8 members per group.
   */
  private async seedMemberships(
    groups: Group[],
    users: User[],
  ): Promise<Membership[]> {
    const memberships: Membership[] = [];

    for (const group of groups) {
      // Each group gets 3-8 members
      const memberCount = Math.floor(Math.random() * 6) + 3;
      const groupMembers = this.shuffleArray([...users]).slice(0, memberCount);

      for (let i = 0; i < groupMembers.length; i++) {
        const membership = this.membershipFactory.create(
          group,
          groupMembers[i],
          i + 1,
        );
        const savedMembership =
          await this.membershipRepository.save(membership);
        memberships.push(savedMembership);
      }
    }

    return memberships;
  }

  /**
   * Seeds contributions into the database.
   * Creates contributions for active memberships based on group rounds.
   */
  private async seedContributions(
    memberships: Membership[],
  ): Promise<Contribution[]> {
    const contributions: Contribution[] = [];

    // Group memberships by group
    const membershipsByGroup = memberships.reduce(
      (acc, membership) => {
        if (!acc[membership.groupId]) {
          acc[membership.groupId] = [];
        }
        acc[membership.groupId].push(membership);
        return acc;
      },
      {} as Record<string, Membership[]>,
    );

    for (const [groupId, groupMemberships] of Object.entries(
      membershipsByGroup,
    )) {
      const group = groupMemberships[0].group;

      // Create contributions for each round up to currentRound
      for (let round = 1; round <= group.currentRound; round++) {
        for (const membership of groupMemberships) {
          // 80% chance a member has contributed in each round
          if (Math.random() < 0.8) {
            const contribution = this.contributionFactory.create(
              group,
              membership.user,
              membership.walletAddress,
              round,
            );
            const savedContribution =
              await this.contributionRepository.save(contribution);
            contributions.push(savedContribution);
          }
        }
      }
    }

    return contributions;
  }

  /**
   * Utility method to shuffle an array (Fisher-Yates algorithm).
   */
  private shuffleArray<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }
}
