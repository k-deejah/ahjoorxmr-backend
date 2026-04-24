import { IsUrl, IsArray, IsString, ArrayNotEmpty } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateWebhookDto {
  @ApiProperty({
    description: 'The URL to send webhook events to',
    example: 'https://api.example.com/webhooks/contributions',
  })
  @IsUrl()
  url: string;

  @ApiProperty({
    description: 'Event types to subscribe to',
    example: ['contribution.verified'],
    isArray: true,
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  eventTypes: string[];
}

export class WebhookResponseDto {
  @ApiProperty()
  id: string;

  @ApiProperty()
  userId: string;

  @ApiProperty()
  url: string;

  @ApiProperty()
  eventTypes: string[];

  @ApiProperty()
  isActive: boolean;

  @ApiProperty()
  createdAt: Date;

  @ApiProperty()
  updatedAt: Date;
}

export class TestWebhookResponseDto {
  @ApiProperty()
  success: boolean;

  @ApiProperty()
  statusCode: number;

  @ApiProperty()
  responseBody: any;

  @ApiProperty()
  deliveryTime: number;
}
