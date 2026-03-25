import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Version,
} from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { EventListenerService } from './event-listener.service';

@ApiTags('Admin - Event Listener')
@Controller('admin/event-listener')
@Version('1')
export class EventListenerController {
  constructor(private readonly eventListenerService: EventListenerService) {}

  @Post('start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start on-chain event polling worker' })
  @ApiResponse({ status: 200, description: 'Event polling worker started' })
  start(): { status: string; pollIntervalMs: number } {
    this.eventListenerService.startPolling();
    const status = this.eventListenerService.getPollingStatus();
    return {
      status: status.running ? 'running' : 'stopped',
      pollIntervalMs: status.pollIntervalMs,
    };
  }

  @Post('stop')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stop on-chain event polling worker' })
  @ApiResponse({ status: 200, description: 'Event polling worker stopped' })
  stop(): { status: string; pollIntervalMs: number } {
    this.eventListenerService.stopPolling();
    const status = this.eventListenerService.getPollingStatus();
    return {
      status: status.running ? 'running' : 'stopped',
      pollIntervalMs: status.pollIntervalMs,
    };
  }

  @Get('status')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get on-chain event polling worker status' })
  @ApiResponse({ status: 200, description: 'Event polling worker status' })
  status(): { status: string; pollIntervalMs: number } {
    const status = this.eventListenerService.getPollingStatus();
    return {
      status: status.running ? 'running' : 'stopped',
      pollIntervalMs: status.pollIntervalMs,
    };
  }
}
