import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { GroupsController } from './groups.controller';
import { GroupsV2Controller } from './groups-v2.controller';
import { GroupsService } from './groups.service';
import { Group } from './entities/group.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { WinstonLogger } from '../common/logger/winston.logger';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { NotificationsModule } from '../notification/notifications.module';
import { StellarModule } from '../stellar/stellar.module';

/**
 * GroupsModule manages ROSCA group entities in the database.
 * It is the source of truth for group state as reflected by the REST API.
 * Smart contract interactions are handled by a separate Stellar service.
 */
@Module({
  imports: [
    TypeOrmModule.forFeature([Group, Membership]),
    NotificationsModule,
    StellarModule,
  ],
  controllers: [GroupsController, GroupsV2Controller],
  providers: [GroupsService, WinstonLogger, JwtAuthGuard],
  exports: [GroupsService],
})
export class GroupsModule {}
