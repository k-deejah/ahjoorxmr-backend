import { Controller, Get, Version } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AppService } from './app.service';
import { InternalServerErrorResponseDto } from './common/dto/error-response.dto';

@Controller()
@ApiTags('Application')
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  @ApiOperation({
    summary: 'Get welcome message',
    description: 'Returns a simple welcome message from the API',
  })
  @ApiResponse({
    status: 200,
    description: 'Welcome message retrieved successfully',
    schema: {
      type: 'string',
      example: 'Hello World!',
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
    type: InternalServerErrorResponseDto,
  })
  getHello(): string {
    return this.appService.getHello();
  }
}
