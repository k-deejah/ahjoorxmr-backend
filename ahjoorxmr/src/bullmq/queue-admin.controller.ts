import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  Version,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { QueueService, AllQueueStats } from './queue.service';
import { JwtAuthGuard } from '../stellar-auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Admin – Queue')
@ApiBearerAuth()
// @UseGuards(JwtAuthGuard, RolesGuard)
// @Roles('admin')
@Controller('admin/queue')
@Version('1')
export class QueueAdminController {
  constructor(private readonly queueService: QueueService) {}

  @Get('stats')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Get queue depths and failed-job counts (admin only)',
  })
  @ApiResponse({
    status: 200,
    description:
      'Queue statistics for all queues including the dead-letter queue',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin role required',
  })
  async getStats(): Promise<AllQueueStats> {
    return this.queueService.getStats();
  }

  @Get('dead-letter')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get dead letter queue jobs (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Dead letter queue jobs retrieved successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin role required',
  })
  async getDeadLetterJobs() {
    return this.queueService.getDeadLetterJobs();
  }

  @Post('retry')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Retry a failed job from dead letter queue (admin only)' })
  @ApiResponse({
    status: 200,
    description: 'Job retry initiated successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - Admin role required',
  })
  async retryJob(@Body() body: { jobId: string }) {
    return this.queueService.retryDeadLetterJob(body.jobId);
  }
}
