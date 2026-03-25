import {
  Controller,
  Get,
  Put,
  Param,
  Body,
  UseInterceptors,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { Cacheable } from '../cache/decorators/cacheable.decorator';
import { CacheInterceptor } from '../cache/interceptors/cache.interceptor';

@Controller('users')
@UseInterceptors(CacheInterceptor)
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('profile/:id')
  @Cacheable({ keyPrefix: 'users:profile', ttl: 300, includeUserId: true })
  async getProfile(@Param('id') id: string) {
    return this.usersService.getProfile(id);
  }

  @Put('profile/:id')
  async updateProfile(@Param('id') id: string, @Body() updateProfileDto: any) {
    const result = await this.usersService.updateProfile(id, updateProfileDto);
    // Invalidate user profile cache
    await this.usersService.invalidateUserCache(id);
    return result;
  }
}
