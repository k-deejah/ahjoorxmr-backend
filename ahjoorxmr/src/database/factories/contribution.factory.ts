import { Injectable } from '@nestjs/common';
import { Contribution } from '../../contributions/entities/contribution.entity';
import { Group } from '../../groups/entities/group.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Factory for generating Contribution entities with realistic test data.
 */
@Injectable()
export class ContributionFactory {
  private transactionCounter = 0;

  /**
   * Creates a new Contribution entity with random data.
   */
  create(
    group: Group,
    user: User,
    walletAddress: string,
    roundNumber: number,
  ): Contribution {
    const contribution = new Contribution();
    contribution.groupId = group.id;
    contribution.group = group;
    contribution.userId = user.id;
    contribution.user = user;
    contribution.walletAddress = walletAddress;
    contribution.roundNumber = roundNumber;
    contribution.amount = group.contributionAmount;
    contribution.transactionHash = this.generateTransactionHash();
    contribution.timestamp = this.generateTimestamp(
      roundNumber,
      group.roundDuration,
    );
    return contribution;
  }

  /**
   * Creates multiple Contribution entities.
   */
  createMany(
    group: Group,
    user: User,
    walletAddress: string,
    rounds: number[],
  ): Contribution[] {
    return rounds.map((round) =>
      this.create(group, user, walletAddress, round),
    );
  }

  /**
   * Generates a unique Stellar transaction hash.
   */
  private generateTransactionHash(): string {
    const chars = '0123456789abcdef';
    let hash = '';
    for (let i = 0; i < 64; i++) {
      hash += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    // Add counter to ensure uniqueness
    this.transactionCounter++;
    return hash + this.transactionCounter.toString(16).padStart(8, '0');
  }

  /**
   * Generates a timestamp for a contribution based on round number.
   */
  private generateTimestamp(roundNumber: number, roundDuration: number): Date {
    const now = new Date();
    const daysAgo = roundNumber * (roundDuration / (24 * 60 * 60));
    const timestamp = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    // Add some random variance (0-7 days within the round)
    const variance = Math.random() * 7 * 24 * 60 * 60 * 1000;
    return new Date(timestamp.getTime() + variance);
  }
}
