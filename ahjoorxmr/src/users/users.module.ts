import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from './users.controller';
import { User } from './entities/user.entity';
import { UserRepository } from './repositories/user.repository';
import { UsersService } from './users.service';
import { AdminUsersController } from './admin-users.controller';
import { GdprModule } from './gdpr.module';

@Module({
  imports: [TypeOrmModule.forFeature([User]), GdprModule],
  controllers: [UsersController, AdminUsersController],
  providers: [UserRepository, UsersService],
  exports: [UserRepository, UsersService, TypeOrmModule],
})
export class UsersModule {}
