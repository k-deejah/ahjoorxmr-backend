import { Entity, Column, OneToMany, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Membership } from '../../memberships/entities/membership.entity';

export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  MODERATOR = 'moderator',
}

/**
 * User entity representing a user in the system.
 * Contains authentication, profile, and relationship data.
 */
@Entity('users')
@Index(['email'], { unique: true, where: 'email IS NOT NULL' })
@Index(['walletAddress'], { unique: true })
@Index(['createdAt'])
export class User extends BaseEntity {
  // Authentication
  @Column({ type: 'varchar', length: 255, unique: true })
  walletAddress: string;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  email?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  username?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  password?: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'user',
  })
  role: 'admin' | 'user' | 'guest';

  @Column({ type: 'varchar', length: 255, nullable: true })
  refreshTokenHash?: string | null;

  @Column({ type: 'integer', default: 0 })
  tokenVersion: number;

  // Two-Factor Authentication
  @Column({ type: 'varchar', length: 255, nullable: true })
  twoFactorSecret?: string | null;

  @Column({ type: 'boolean', default: false })
  twoFactorEnabled: boolean;

  @Column({ type: 'text', array: true, nullable: true })
  backupCodes?: string[] | null;

  // Profile Information
  @Column({ type: 'varchar', length: 255, nullable: true })
  firstName?: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  lastName?: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  avatarUrl?: string | null;

  @Column({ type: 'text', nullable: true })
  bio?: string | null;

  // Settings & Preferences
  @Column({ type: 'jsonb', nullable: true })
  preferences?: {
    language?: string;
    currency?: string;
    notifications?: {
      email?: boolean;
      push?: boolean;
      sms?: boolean;
    };
    theme?: 'light' | 'dark' | 'auto';
  } | null;

  // Account Status
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'boolean', default: false })
  isVerified: boolean;

  @Column({ type: 'timestamp', nullable: true })
  verifiedAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt?: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  bannedAt?: Date | null;

  @Column({ type: 'text', nullable: true })
  banReason?: string | null;

  // Metadata
  @Column({ type: 'varchar', length: 100, nullable: true })
  registrationIp?: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  lastLoginIp?: string | null;

  @Column({ type: 'jsonb', nullable: true })
  metadata?: Record<string, any> | null;

  // Relationships
  @OneToMany(() => Membership, (membership) => membership.user, {
    cascade: true,
  })
  memberships?: Membership[];

  // Virtual fields (not stored in database)
  get fullName(): string {
    if (this.firstName && this.lastName) {
      return `${this.firstName} ${this.lastName}`;
    }
    return this.firstName || this.lastName || this.username || 'Anonymous';
  }

  get isBanned(): boolean {
    return this.bannedAt !== null && this.bannedAt !== undefined;
  }

  // Helper methods
  updateLastLogin(ipAddress?: string): void {
    this.lastLoginAt = new Date();
    if (ipAddress) {
      this.lastLoginIp = ipAddress;
    }
  }

  ban(reason: string): void {
    this.bannedAt = new Date();
    this.banReason = reason;
    this.isActive = false;
  }

  unban(): void {
    this.bannedAt = null;
    this.banReason = null;
    this.isActive = true;
  }

  verify(): void {
    this.isVerified = true;
    this.verifiedAt = new Date();
  }
}
