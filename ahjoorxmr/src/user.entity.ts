import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum MembershipTier {
  SILVER = 'silver',
  GOLD = 'gold',
  BLACK = 'black',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Stellar public key — primary identifier for wallet-registered users.
   * Unique and indexed; nullable only for pure email accounts created
   * before wallet-auth was the primary path.
   */
  @Column({ type: 'varchar', length: 56, nullable: true, unique: true })
  @Index()
  walletAddress: string | null;

  /**
   * Email is optional — wallet-registered users may never provide one.
   */
  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  @Index()
  email: string | null;

  @Column({ type: 'varchar', nullable: true, select: false })
  passwordHash: string | null;

  @Column({ type: 'varchar', length: 30, nullable: true, unique: true })
  username: string | null;

  @Column({
    type: 'enum',
    enum: MembershipTier,
    default: MembershipTier.SILVER,
  })
  tier: MembershipTier;

  @Column({ default: false })
  isKycVerified: boolean;

  @Column({ default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
