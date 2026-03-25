import { Entity, Column, ManyToOne, JoinColumn, Index, Unique } from 'typeorm';
import { MembershipStatus } from './membership-status.enum';
import { Group } from '../../groups/entities/group.entity';
import { User } from '../../users/entities/user.entity';
import { BaseEntity } from '../../common/entities/base.entity';

/**
 * Membership entity representing a user's participation in a ROSCA group.
 * Tracks membership status, payout order, and contribution flags.
 */
@Entity('memberships')
@Unique(['groupId', 'userId'])
export class Membership extends BaseEntity {
  @Column('uuid')
  @Index()
  groupId: string;

  @ManyToOne(() => Group)
  @JoinColumn({ name: 'groupId' })
  group: Group;

  @Column('uuid')
  @Index()
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column('varchar', { length: 255 })
  walletAddress: string;

  @Column('int')
  payoutOrder: number;

  @Column('boolean', { default: false })
  hasReceivedPayout: boolean;

  @Column('boolean', { default: false })
  hasPaidCurrentRound: boolean;

  @Column('int', { default: 0 })
  contributionsMade: number;

  @Column('varchar', { length: 255, nullable: true })
  transactionHash: string | null;

  // Using PostgreSQL ENUM type for better type safety and performance
  @Column({
    type: 'enum',
    enum: MembershipStatus,
    default: MembershipStatus.ACTIVE,
  })
  status: MembershipStatus;
}
