import { Entity, Column, ManyToOne, JoinColumn, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Group } from '../../groups/entities/group.entity';
import { User } from '../../users/entities/user.entity';

export enum MembershipRole {
  ADMIN = 'admin',
  MEMBER = 'member',
}

export enum MembershipStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  KICKED = 'kicked',
  LEFT = 'left',
}

/**
 * Membership entity representing user-group relationships
 * Tracks member participation and status in ROSCA groups
 */
@Entity('memberships')
@Unique(['userId', 'groupId'])
@Index(['userId'])
@Index(['groupId'])
@Index(['status'])
@Index(['createdAt'])
export class Membership extends BaseEntity {
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'uuid' })
  groupId: string;

  @Column({
    type: 'enum',
    enum: MembershipRole,
    default: MembershipRole.MEMBER,
  })
  role: MembershipRole;

  @Column({
    type: 'enum',
    enum: MembershipStatus,
    default: MembershipStatus.PENDING,
  })
  status: MembershipStatus;

  @Column({ type: 'timestamp', nullable: true })
  joinedAt?: Date;

  @Column({ type: 'timestamp', nullable: true })
  leftAt?: Date;

  @Column({ type: 'text', nullable: true })
  leaveReason?: string;

  // Payment tracking
  @Column({ type: 'int', default: 0 })
  contributionsMade: number;

  @Column({ type: 'int', default: 0 })
  contributionsMissed: number;

  @Column({ type: 'varchar', length: 100, default: '0' })
  totalContributed: string;

  @Column({ type: 'boolean', default: true })
  isEligibleForPayout: boolean;

  // Relationships
  @ManyToOne(() => User, (user) => user.memberships, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user?: User;

  @ManyToOne(() => Group, (group) => group.memberships, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'groupId' })
  group?: Group;

  // Helper methods
  activate(): void {
    this.status = MembershipStatus.ACTIVE;
    this.joinedAt = new Date();
  }

  leave(reason?: string): void {
    this.status = MembershipStatus.LEFT;
    this.leftAt = new Date();
    this.leaveReason = reason;
  }

  kick(reason?: string): void {
    this.status = MembershipStatus.KICKED;
    this.leftAt = new Date();
    this.leaveReason = reason;
    this.isEligibleForPayout = false;
  }

  recordContribution(amount: string): void {
    this.contributionsMade += 1;
    const current = BigInt(this.totalContributed);
    const additional = BigInt(amount);
    this.totalContributed = (current + additional).toString();
  }

  recordMissedContribution(): void {
    this.contributionsMissed += 1;

    // If missed too many contributions, mark as ineligible
    if (this.contributionsMissed > 2) {
      this.isEligibleForPayout = false;
    }
  }
}
