import {
  Controller,
  Post,
  Get,
  Delete,
  Body,
  Param,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiBearerAuth, ApiResponse } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { WebhookService } from './webhook.service';
import {
  CreateWebhookDto,
  WebhookResponseDto,
  TestWebhookResponseDto,
} from './dto/webhook.dto';

@ApiTags('Webhooks')
@Controller('webhooks')
@UseGuards(JwtAuthGuard)
@ApiBearerAuth('JWT-auth')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new webhook' })
  @ApiResponse({
    status: 201,
    description: 'Webhook created successfully',
    type: WebhookResponseDto,
  })
  async createWebhook(
    @Request() req: any,
    @Body() createWebhookDto: CreateWebhookDto,
  ): Promise<WebhookResponseDto> {
    const userId = req.user.userId;

    const webhook = await this.webhookService.createWebhook(
      userId,
      createWebhookDto.url,
      createWebhookDto.eventTypes,
    );

    return {
      id: webhook.id,
      userId: webhook.userId,
      url: webhook.url,
      eventTypes: webhook.eventTypes,
      isActive: webhook.isActive,
      createdAt: webhook.createdAt,
      updatedAt: webhook.updatedAt,
    };
  }

  @Get()
  @ApiOperation({ summary: 'Get all webhooks for the authenticated user' })
  @ApiResponse({
    status: 200,
    description: 'List of webhooks',
    type: [WebhookResponseDto],
  })
  async getUserWebhooks(@Request() req: any): Promise<WebhookResponseDto[]> {
    const userId = req.user.userId;
    const webhooks = await this.webhookService.getUserWebhooks(userId);

    return webhooks.map((webhook) => ({
      id: webhook.id,
      userId: webhook.userId,
      url: webhook.url,
      eventTypes: webhook.eventTypes,
      isActive: webhook.isActive,
      createdAt: webhook.createdAt,
      updatedAt: webhook.updatedAt,
    }));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a webhook' })
  @ApiResponse({ status: 204, description: 'Webhook deleted successfully' })
  @ApiResponse({ status: 404, description: 'Webhook not found' })
  async deleteWebhook(
    @Request() req: any,
    @Param('id') webhookId: string,
  ): Promise<void> {
    const userId = req.user.userId;

    try {
      await this.webhookService.deleteWebhook(webhookId, userId);
    } catch (error) {
      throw new NotFoundException('Webhook not found or unauthorized');
    }
  }

  @Post(':id/test')
  @ApiOperation({ summary: 'Test a webhook with a synthetic event' })
  @ApiResponse({
    status: 200,
    description: 'Test webhook delivery result',
    type: TestWebhookResponseDto,
  })
  async testWebhook(
    @Request() req: any,
    @Param('id') webhookId: string,
  ): Promise<TestWebhookResponseDto> {
    const userId = req.user.userId;

    try {
      const result = await this.webhookService.testWebhook(webhookId);

      return {
        success: result.statusCode >= 200 && result.statusCode < 300,
        statusCode: result.statusCode,
        responseBody: result.responseBody,
        deliveryTime: result.deliveryTime,
      };
    } catch (error) {
      throw new BadRequestException(
        `Failed to test webhook: ${error.message}`,
      );
    }
  }
}
