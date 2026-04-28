import {
  Entity,
  Column,
  ManyToOne,
  JoinColumn,
  DeleteDateColumn,
  Index,
} from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';

/**
 * Template configuration interface for storing group template settings as JSONB.
 * Captures all reusable group configuration parameters.
 */
export interface GroupTemplateConfig {
  contributionAmount: string;
  roundDuration: number;
  totalRounds: number;
  maxMembers?: number;
  minMembers: number;
  assetCode?: string;
  assetIssuer?: string | null;
  payoutOrderStrategy?: string;
  penaltyRate?: number;
  gracePeriodHours?: number;
  timezone?: string | null;
}

/**
 * GroupTemplate entity representing a reusable configuration preset for creating groups.
 * Owned by a user and can be public or private.
 */
@Entity('group_templates')
@Index('idx_group_templates_owner_id', ['ownerId'])
@Index('idx_group_templates_public', ['isPublic'], { where: '"isPublic" = true' })
export class GroupTemplate extends BaseEntity {
  @Column('varchar', { length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 1000, nullable: true, default: null })
  description: string | null;

  @Column({ type: 'boolean', default: false })
  isPublic: boolean;

  @Column({ type: 'jsonb' })
  config: GroupTemplateConfig;

  @Column({ type: 'uuid' })
  ownerId: string;

  @Column({ type: 'int', default: 0 })
  usageCount: number;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;

  @ManyToOne(() => User, { eager: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'ownerId' })
  owner: User;
}
