import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  UseInterceptors,
} from '@nestjs/common';
import { GroupsService } from './groups.service';
import { Cacheable } from '../cache/decorators/cacheable.decorator';
import { CacheInterceptor } from '../cache/interceptors/cache.interceptor';

@Controller('groups')
@UseInterceptors(CacheInterceptor)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  @Get()
  @Cacheable({ keyPrefix: 'groups:list', ttl: 300, includeUserId: true })
  async findAll() {
    return this.groupsService.findAll();
  }

  @Get(':id')
  @Cacheable({ keyPrefix: 'groups:detail', ttl: 300, includeUserId: true })
  async findOne(@Param('id') id: string) {
    return this.groupsService.findOne(id);
  }

  @Post()
  async create(@Body() createGroupDto: any) {
    const result = await this.groupsService.create(createGroupDto);
    // Invalidate cache after mutation
    await this.groupsService.invalidateGroupCache();
    return result;
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() updateGroupDto: any) {
    const result = await this.groupsService.update(id, updateGroupDto);
    // Invalidate specific group and list cache
    await this.groupsService.invalidateGroupCache(id);
    return result;
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const result = await this.groupsService.remove(id);
    // Invalidate specific group and list cache
    await this.groupsService.invalidateGroupCache(id);
    return result;
  }
}
