import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * Stores issued refresh tokens for rotation and revocation.
 * On each /auth/refresh call the old token is revoked and a new one is issued.
 * Supports per-device tracking and absolute session expiry.
 */
@Entity('refresh_tokens')
@Index(['userId'])
@Index(['tokenHash'], { unique: true })
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('uuid')
  userId: string;

  @Column({ type: 'varchar', length: 255, unique: true })
  tokenHash: string;

  /** Sliding expiry for this specific token (e.g. 7 days from issuance). */
  @Column({ type: 'timestamp' })
  expiresAt: Date;

  /**
   * Absolute session expiry. Even if the token is rotated, the session cannot
   * be refreshed beyond this timestamp. Set to NOW() + REFRESH_TOKEN_ABSOLUTE_EXPIRY
   * on first issuance and carried forward on rotation.
   */
  @Column({ type: 'timestamp' })
  absoluteExpiresAt: Date;

  @Column({ type: 'timestamp', nullable: true, default: null })
  revokedAt: Date | null;

  /** Opaque device identifier supplied by the client (e.g. UUID stored in localStorage). */
  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  deviceId: string | null;

  /** Human-readable device name (e.g. "Chrome on macOS"). */
  @Column({ type: 'varchar', length: 255, nullable: true, default: null })
  deviceName: string | null;

  /** IP address at the time of token issuance. */
  @Column({ type: 'varchar', length: 45, nullable: true, default: null })
  ipAddress: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  lastUsedAt: Date;
}
