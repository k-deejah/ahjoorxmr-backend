import { Entity, Column, ManyToOne, JoinColumn, Index } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { User } from '../../users/entities/user.entity';
import { encryptedTransformer } from '../../common/encryption/field-encryption.transformer';

@Entity('kyc_documents')
@Index(['userId'])
export class KycDocument extends BaseEntity {
  @Column('uuid')
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column('varchar', { length: 500 })
  storageKey: string;

  @Column('varchar', { length: 500 })
  url: string;

  @Column('varchar', { length: 100 })
  mimeType: string;

  @Column('int')
  fileSize: number;

  @Column('varchar', { length: 255 })
  originalName: string;

  @Column({ type: 'varchar', length: 500, nullable: true, transformer: encryptedTransformer })
  documentNumber?: string | null;

  @Column({ type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  uploadedAt: Date;
}
