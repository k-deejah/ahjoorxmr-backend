import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { SeedService } from './seed.service';
import { User } from '../../users/entities/user.entity';
import { Group } from '../../groups/entities/group.entity';
import { Membership } from '../../memberships/entities/membership.entity';
import { Contribution } from '../../contributions/entities/contribution.entity';
import { UserFactory } from '../factories/user.factory';
import { GroupFactory } from '../factories/group.factory';
import { MembershipFactory } from '../factories/membership.factory';
import { ContributionFactory } from '../factories/contribution.factory';

@Module({
  imports: [TypeOrmModule.forFeature([User, Group, Membership, Contribution])],
  providers: [
    SeedService,
    UserFactory,
    GroupFactory,
    MembershipFactory,
    ContributionFactory,
  ],
  exports: [SeedService],
})
export class SeedModule {}
