import { Entity, Column, ManyToOne, JoinColumn, Index, Unique } from 'typeorm';
import { BaseEntity } from '../../common/entities/base.entity';
import { Group } from '../../groups/entities/group.entity';
import { User } from '../../users/entities/user.entity';

export enum WaitlistStatus {
  WAITING = 'WAITING',
  ADMITTED = 'ADMITTED',
  CANCELLED = 'CANCELLED',
}

@Entity('group_waitlist')
@Unique(['groupId', 'userId'])
@Index(['groupId', 'position'])
export class GroupWaitlist extends BaseEntity {
  @Column('uuid')
  @Index()
  groupId: string;

  @ManyToOne(() => Group)
  @JoinColumn({ name: 'groupId' })
  group: Group;

  @Column('uuid')
  @Index()
  userId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column('int')
  position: number;

  @Column({ type: 'timestamptz', default: () => 'NOW()' })
  joinedWaitlistAt: Date;

  @Column({
    type: 'enum',
    enum: WaitlistStatus,
    default: WaitlistStatus.WAITING,
  })
  status: WaitlistStatus;
}
