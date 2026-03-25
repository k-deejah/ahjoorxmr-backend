import { Injectable } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';

@Injectable()
export class UsersService {
  constructor(private readonly cacheService: CacheService) {}

  async getProfile(id: string) {
    // Simulate database query
    return {
      id,
      name: `User ${id}`,
      email: `user${id}@example.com`,
      bio: 'Sample bio',
    };
  }

  async updateProfile(id: string, updateProfileDto: any) {
    // Simulate database update
    return { id, ...updateProfileDto };
  }

  async invalidateUserCache(userId: string) {
    // Invalidate specific user profile cache
    await this.cacheService.delPattern(`users:profile:*:*/profile/${userId}`);
  }
}
