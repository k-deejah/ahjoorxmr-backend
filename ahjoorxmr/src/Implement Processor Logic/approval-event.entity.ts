import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('approval_events')
export class ApprovalEvent {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'owner_address' })
  ownerAddress: string;

  @Column({ name: 'spender_address' })
  spenderAddress: string;

  @Column({ name: 'amount', type: 'numeric', precision: 78, scale: 0 })
  amount: string;

  @Column({ name: 'transaction_hash' })
  @Index()
  transactionHash: string;

  @Column({ name: 'block_number', type: 'bigint' })
  blockNumber: number;

  @Column({ name: 'contract_address' })
  contractAddress: string;

  @Column({ name: 'chain_id' })
  chainId: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
