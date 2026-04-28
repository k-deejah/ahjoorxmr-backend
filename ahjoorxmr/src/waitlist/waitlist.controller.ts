import {
  Controller,
  Post,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  UseGuards,
  Request,
  Version,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { WaitlistService } from './waitlist.service';
import { JwtAuthGuard } from '../groups/guards/jwt-auth.guard';

@ApiTags('Waitlist')
@Controller('groups')
@Version('1')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth()
export class WaitlistController {
  constructor(private readonly waitlistService: WaitlistService) {}

  @Post(':id/waitlist')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Join the group waitlist' })
  @ApiParam({ name: 'id', description: 'Group UUID', format: 'uuid' })
  @ApiResponse({ status: 201, description: 'Joined waitlist', schema: { properties: { position: { type: 'number' } } } })
  @ApiResponse({ status: 409, description: 'Already a member or already on waitlist' })
  @ApiResponse({ status: 400, description: 'Group not full or waitlist cap reached' })
  async joinWaitlist(
    @Param('id', ParseUUIDPipe) groupId: string,
    @Request() req: any,
  ): Promise<{ position: number }> {
    return this.waitlistService.joinWaitlist(groupId, req.user.userId);
  }

  @Delete(':id/waitlist')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Leave the group waitlist' })
  @ApiParam({ name: 'id', description: 'Group UUID', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Left waitlist' })
  @ApiResponse({ status: 404, description: 'Waitlist entry not found' })
  async leaveWaitlist(
    @Param('id', ParseUUIDPipe) groupId: string,
    @Request() req: any,
  ): Promise<void> {
    await this.waitlistService.leaveWaitlist(groupId, req.user.userId);
  }

  @Get(':id/waitlist')
  @ApiOperation({ summary: 'Get ordered waitlist (group admin only)' })
  @ApiParam({ name: 'id', description: 'Group UUID', format: 'uuid' })
  @ApiResponse({ status: 200, description: 'Ordered waitlist with user details' })
  @ApiResponse({ status: 403, description: 'Not the group admin' })
  async getWaitlist(
    @Param('id', ParseUUIDPipe) groupId: string,
    @Request() req: any,
  ) {
    return this.waitlistService.getWaitlist(groupId, req.user.userId);
  }
}
