import { Entity, Column, OneToMany, DeleteDateColumn } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { GroupStatus } from './group-status.enum';
import { Membership } from '../../memberships/entities/membership.entity';

/**
 * Group entity representing a ROSCA savings group.
 * Mirrors the on-chain group state and serves as the source of truth for the API.
 */
@Entity('groups')
export class Group extends BaseEntity {
  @Column('varchar', { length: 255 })
  name: string;

  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  contractAddress: string | null;

  @Column('varchar', { length: 255 })
  adminWallet: string;

  @Column('varchar', { length: 100 })
  contributionAmount: string;

  @Column('varchar', { length: 255 })
  token: string;

  /**
   * Stellar asset code for contributions/payouts (e.g. 'XLM', 'USDC').
   * Defaults to 'XLM' (native asset). Max 12 chars per Stellar spec.
   */
  @Column({ type: 'varchar', length: 12, default: 'XLM' })
  assetCode: string;

  /**
   * Stellar account ID of the asset issuer.
   * Null for native XLM. Required for any non-XLM asset.
   */
  @Column({ type: 'varchar', length: 56, nullable: true, default: null })
  assetIssuer: string | null;

  @Column('int')
  roundDuration: number;

  @Column({
    type: 'enum',
    enum: GroupStatus,
    default: GroupStatus.PENDING,
  })
  status: GroupStatus;

  @Column('int', { default: 0 })
  currentRound: number;

  @Column('int')
  totalRounds: number;

  @Column('int')
  minMembers: number;

  @Column('int')
  maxMembers: number;

  @Column({ type: 'timestamp', nullable: true, default: null })
  staleAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true, default: null })
  startDate: Date | null;

  @Column({ type: 'timestamptz', nullable: true, default: null })
  endDate: Date | null;

  @Column({ type: 'varchar', length: 64, nullable: true, default: 'UTC' })
  timezone: string | null;

  @DeleteDateColumn({ nullable: true })
  deletedAt: Date | null;

  @OneToMany(() => Membership, (membership) => membership.group)
  memberships: Membership[];
}
