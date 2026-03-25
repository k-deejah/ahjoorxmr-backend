import { Module } from '@nestjs/common';
import { CacheModule } from './cache/cache.module';
import { GroupsModule } from './groups/groups.module';
import { UsersModule } from './users/users.module';

@Module({
  imports: [CacheModule, GroupsModule, UsersModule],
})
export class AppModule {}
