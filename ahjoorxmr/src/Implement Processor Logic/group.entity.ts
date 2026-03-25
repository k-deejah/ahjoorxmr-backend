import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('groups')
export class Group {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'name' })
  name: string;

  @Column({ name: 'contract_address', nullable: true })
  contractAddress: string | null;

  @Column({ name: 'chain_id', nullable: true })
  chainId: number | null;

  @Column({ name: 'status', default: 'active' })
  status: string;

  @Column({ name: 'current_round', type: 'int', default: 0 })
  currentRound: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
