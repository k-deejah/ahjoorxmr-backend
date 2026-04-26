import { Entity, Column, OneToMany, Index } from 'typeorm';
import { Exclude, Expose } from 'class-transformer';
import { BaseEntity } from '../../common/entities/base.entity';
import { Membership } from '../../memberships/entities/membership.entity';
import { KycStatus } from '../../kyc/entities/kyc-status.enum';
import { KycDocument } from '../../kyc/entities/kyc-document.entity';
import { encryptedTransformer } from '../../common/encryption/field-encryption.transformer';

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
@Index(['emailBlindIndex'], { unique: true, where: '"emailBlindIndex" IS NOT NULL' })
@Index(['walletAddress'], { unique: true })
@Index(['createdAt'])
export class User extends BaseEntity {
  // Authentication
  @Column({ type: 'varchar', length: 255, unique: true })
  walletAddress: string;

  @Column({ type: 'varchar', length: 500, nullable: true, transformer: encryptedTransformer })
  email?: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  emailBlindIndex?: string | null;

  @Column({ type: 'boolean', default: false })
  emailVerified: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  username?: string | null;

  @Exclude()
  @Column({ type: 'varchar', length: 255, nullable: true })
  password?: string | null;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'user',
  })
  role: 'admin' | 'user' | 'guest';

  @Exclude()
  @Column({ type: 'varchar', length: 255, nullable: true })
  refreshTokenHash?: string | null;

  @Exclude()
  @Column({ type: 'integer', default: 0 })
  tokenVersion: number;

  // Two-Factor Authentication
  @Exclude()
  @Column({ type: 'varchar', length: 500, nullable: true, transformer: encryptedTransformer })
  twoFactorSecret?: string | null;

  @Column({ type: 'boolean', default: false })
  twoFactorEnabled: boolean;

  @Exclude()
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
  profileIncompleteReminderSentAt?: Date | null;

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

  // KYC
  @Column({
    type: 'enum',
    enum: KycStatus,
    nullable: true,
    default: null,
  })
  kycStatus?: KycStatus | null;

  // Relationships
  @OneToMany(() => Membership, (membership) => membership.user, {
    cascade: true,
  })
  memberships?: Membership[];

  @OneToMany(() => KycDocument, (doc) => doc.user)
  kycDocuments?: KycDocument[];

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
