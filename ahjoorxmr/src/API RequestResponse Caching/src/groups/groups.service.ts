import { Injectable } from '@nestjs/common';
import { CacheService } from '../cache/cache.service';

@Injectable()
export class GroupsService {
  constructor(private readonly cacheService: CacheService) {}

  async findAll() {
    // Simulate database query
    return [
      { id: '1', name: 'Group 1', members: 10 },
      { id: '2', name: 'Group 2', members: 5 },
    ];
  }

  async findOne(id: string) {
    // Simulate database query
    return { id, name: `Group ${id}`, members: 10 };
  }

  async create(createGroupDto: any) {
    // Simulate database insert
    return { id: '3', ...createGroupDto };
  }

  async update(id: string, updateGroupDto: any) {
    // Simulate database update
    return { id, ...updateGroupDto };
  }

  async remove(id: string) {
    // Simulate database delete
    return { id, deleted: true };
  }

  async invalidateGroupCache(groupId?: string) {
    if (groupId) {
      // Invalidate specific group cache for all users
      await this.cacheService.delPattern(`groups:detail:*:*/${groupId}`);
    }
    // Invalidate all group list caches
    await this.cacheService.delPattern('groups:list:*');
  }
}
