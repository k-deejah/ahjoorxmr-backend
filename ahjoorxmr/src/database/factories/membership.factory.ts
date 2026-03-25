import { Injectable } from '@nestjs/common';
import { Membership } from '../../memberships/entities/membership.entity';
import { MembershipStatus } from '../../memberships/entities/membership-status.enum';
import { Group } from '../../groups/entities/group.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Factory for generating Membership entities with realistic test data.
 */
@Injectable()
export class MembershipFactory {
  /**
   * Creates a new Membership entity with random data.
   */
  create(group: Group, user: User, payoutOrder: number): Membership {
    const membership = new Membership();
    membership.groupId = group.id;
    membership.group = group;
    membership.userId = user.id;
    membership.user = user;
    membership.walletAddress = this.generateStellarAddress();
    membership.payoutOrder = payoutOrder;
    membership.hasReceivedPayout = this.hasReceivedPayout(
      group.currentRound,
      payoutOrder,
    );
    membership.hasPaidCurrentRound = Math.random() < 0.8; // 80% have paid
    membership.status = this.getRandomStatus();
    return membership;
  }

  /**
   * Creates multiple Membership entities for a group.
   */
  createMany(group: Group, users: User[]): Membership[] {
    return users.map((user, index) => this.create(group, user, index + 1));
  }

  /**
   * Determines if a member has received payout based on current round and payout order.
   */
  private hasReceivedPayout(
    currentRound: number,
    payoutOrder: number,
  ): boolean {
    return currentRound >= payoutOrder;
  }

  /**
   * Gets a random membership status (mostly active).
   */
  private getRandomStatus(): MembershipStatus {
    const rand = Math.random();
    if (rand < 0.85) return MembershipStatus.ACTIVE;
    if (rand < 0.95) return MembershipStatus.SUSPENDED;
    return MembershipStatus.REMOVED;
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
