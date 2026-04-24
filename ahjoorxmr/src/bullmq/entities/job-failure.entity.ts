import { Entity, Column, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, Index } from 'typeorm';

export type JobFailureStatus = 'PENDING' | 'RETRYING' | 'RESOLVED';

@Entity('job_failures')
@Index(['queueName', 'failedAt'])
@Index(['jobName'])
@Index(['status'])
export class JobFailure {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('varchar', { length: 255 })
  jobId: string;

  @Column('varchar', { length: 255 })
  jobName: string;

  @Column('varchar', { length: 255 })
  queueName: string;

  @CreateDateColumn({ type: 'timestamptz' })
  failedAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column('text')
  error: string;

  @Column('text', { nullable: true })
  stackTrace: string | null;

  @Column('int', { default: 1 })
  attemptNumber: number;

  @Column('jsonb', { nullable: true })
  data: Record<string, unknown> | null;

  @Column('int', { default: 0 })
  retryCount: number;

  @Column({
    type: 'varchar',
    length: 20,
    default: 'PENDING',
  })
  status: JobFailureStatus;

  @Column({ type: 'timestamptz', nullable: true })
  lastRetriedAt: Date | null;
}
