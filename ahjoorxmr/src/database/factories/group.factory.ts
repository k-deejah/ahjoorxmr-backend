import { Injectable } from '@nestjs/common';
import { Group } from '../../groups/entities/group.entity';
import { GroupStatus } from '../../groups/entities/group-status.enum';
import { User } from '../../users/entities/user.entity';

/**
 * Factory for generating Group entities with realistic test data.
 */
@Injectable()
export class GroupFactory {
  private readonly groupNames = [
    'Community Savings Circle',
    'Neighborhood Fund',
    'Friends Investment Group',
    'Family Savings Pool',
    'Local Business Collective',
    'Village Development Fund',
    'Women Empowerment Group',
    'Youth Savings Initiative',
    'Farmers Cooperative Fund',
    'Teachers Savings Circle',
    'Market Vendors Association',
    'Church Savings Group',
    'School Parents Fund',
    'Sports Club Savings',
    'Cultural Association Pool',
  ];

  private readonly tokens = ['USDC', 'XLM', 'USDT', 'EURC'];

  /**
   * Creates a new Group entity with random data.
   */
  create(adminUser: User): Group {
    const group = new Group();
    group.name = this.getRandomGroupName();
    group.adminWallet = this.generateStellarAddress();
    group.contractAddress =
      Math.random() < 0.7 ? this.generateStellarAddress() : null;
    group.contributionAmount = this.getRandomContributionAmount();
    group.token = this.getRandomToken();
    group.roundDuration = this.getRandomRoundDuration();
    group.status = this.getRandomStatus();
    group.currentRound = this.getCurrentRound(group.status);
    group.totalRounds = Math.floor(Math.random() * 8) + 4; // 4-12 rounds
    group.minMembers = Math.floor(Math.random() * 3) + 3; // 3-5 min members
    return group;
  }

  /**
   * Creates multiple Group entities.
   */
  createMany(count: number, users: User[]): Group[] {
    return Array.from({ length: count }, (_, i) =>
      this.create(users[i % users.length]),
    );
  }

  /**
   * Gets a random group name.
   */
  private getRandomGroupName(): string {
    return this.groupNames[Math.floor(Math.random() * this.groupNames.length)];
  }

  /**
   * Gets a random token.
   */
  private getRandomToken(): string {
    return this.tokens[Math.floor(Math.random() * this.tokens.length)];
  }

  /**
   * Gets a random contribution amount.
   */
  private getRandomContributionAmount(): string {
    const amounts = ['100', '250', '500', '1000', '2500', '5000'];
    return amounts[Math.floor(Math.random() * amounts.length)];
  }

  /**
   * Gets a random round duration in seconds.
   */
  private getRandomRoundDuration(): number {
    // Common durations: 1 week, 2 weeks, 1 month
    const durations = [
      7 * 24 * 60 * 60, // 1 week
      14 * 24 * 60 * 60, // 2 weeks
      30 * 24 * 60 * 60, // 1 month
    ];
    return durations[Math.floor(Math.random() * durations.length)];
  }

  /**
   * Gets a random group status.
   */
  private getRandomStatus(): GroupStatus {
    const rand = Math.random();
    if (rand < 0.2) return GroupStatus.PENDING;
    if (rand < 0.7) return GroupStatus.ACTIVE;
    return GroupStatus.COMPLETED;
  }

  /**
   * Gets current round based on status.
   */
  private getCurrentRound(status: GroupStatus): number {
    if (status === GroupStatus.PENDING) return 0;
    if (status === GroupStatus.COMPLETED) return 12;
    return Math.floor(Math.random() * 8) + 1; // 1-8 for active groups
  }

  /**
   * Generates a random Stellar address.
   */
  private generateStellarAddress(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let address = 'G';
    for (let i = 0; i < 55; i++) {
      address += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return address;
  }
}
