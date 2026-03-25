import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('on_chain_events')
@Index(['transactionHash', 'chainId'], { unique: true })
export class OnChainEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'event_name' })
  eventName: string;

  @Column({ name: 'transaction_hash' })
  @Index()
  transactionHash: string;

  @Column({ name: 'block_number', type: 'bigint' })
  blockNumber: number;

  @Column({ name: 'contract_address' })
  contractAddress: string;

  @Column({ name: 'chain_id' })
  chainId: number;

  @Column({ name: 'processed_at', type: 'timestamp', nullable: true })
  processedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
