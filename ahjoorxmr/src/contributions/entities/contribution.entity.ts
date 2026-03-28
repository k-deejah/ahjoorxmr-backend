import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Group } from '../../groups/entities/group.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Contribution entity representing a member's on-chain contribution to a ROSCA group.
 * Tracks contribution details including amount, round number, and blockchain transaction hash.
 */
@Entity('contributions')
@Unique(['transactionHash'])
@Unique(['userId', 'groupId', 'roundNumber'])
export class Contribution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

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
  roundNumber: number;

  @Column('varchar', { length: 255 })
  amount: string;

  @Column('varchar', { length: 255 })
  @Index()
  transactionHash: string;

  @Column('timestamp')
  timestamp: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
