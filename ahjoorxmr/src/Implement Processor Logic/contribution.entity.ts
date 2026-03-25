import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('contributions')
export class Contribution {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'from_address' })
  fromAddress: string;

  @Column({ name: 'to_address' })
  toAddress: string;

  @Column({ name: 'amount', type: 'numeric', precision: 78, scale: 0 })
  amount: string;

  @Column({ name: 'transaction_hash', nullable: true })
  @Index({ unique: true, where: 'transaction_hash IS NOT NULL' })
  transactionHash: string | null;

  @Column({ name: 'block_number', type: 'bigint', nullable: true })
  blockNumber: number | null;

  @Column({ name: 'contract_address', nullable: true })
  contractAddress: string | null;

  @Column({ name: 'chain_id', nullable: true })
  chainId: number | null;

  @Column({ name: 'status', default: 'pending' })
  status: string; // 'pending' | 'confirmed' | 'failed'

  @Column({ name: 'confirmed_at', type: 'timestamp', nullable: true })
  confirmedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
