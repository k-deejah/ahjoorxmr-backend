import {
  Controller,
  Get,
  Post,
  Delete,
  Param,
  Query,
  SerializeOptions,
  UseGuards,
  Version,
  Request,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiQuery,
} from '@nestjs/swagger';
import { GetUsersQueryDto, PaginatedUsersResponseDto } from './dto/user.dto';
import {
  InternalServerErrorResponseDto,
  ValidationErrorResponseDto,
} from '../common/dto/error-response.dto';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UsersService } from './users.service';
import { UserResponseDto } from './dto/user-response.dto';
import { GdprService } from './gdpr.service';

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly gdprService: GdprService,
  ) {}
  @Get()
  @Version('1')
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get paginated list of users',
    description:
      'Returns a paginated list of users with optional filtering and sorting. Requires authentication.',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (default: 1)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (default: 10)',
    example: 10,
  })
  @ApiQuery({
    name: 'search',
    required: false,
    type: String,
    description: 'Search term for user name or email',
    example: 'john',
  })
  @ApiQuery({
    name: 'sortBy',
    required: false,
    type: String,
    description: 'Field to sort by',
    example: 'createdAt',
  })
  @ApiQuery({
    name: 'sortOrder',
    required: false,
    enum: ['asc', 'desc'],
    description: 'Sort order',
    example: 'desc',
  })
  @ApiQuery({
    name: 'role',
    required: false,
    enum: ['admin', 'user', 'moderator'],
    description: 'Filter by user role',
    example: 'user',
  })
  @ApiResponse({
    status: 200,
    description: 'Users retrieved successfully',
    type: PaginatedUsersResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid query parameters',
    type: ValidationErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - Invalid or missing JWT token',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 401 },
        message: { type: 'string', example: 'Unauthorized' },
        error: { type: 'string', example: 'Unauthorized' },
      },
    },
  })
  @ApiResponse({
    status: 500,
    description: 'Internal server error',
    type: InternalServerErrorResponseDto,
  })
  getUsers(@Query() query: GetUsersQueryDto): PaginatedUsersResponseDto {
    // Mock response - replace with actual implementation
    const mockUsers = [
      {
        id: '123e4567-e89b-12d3-a456-426614174000',
        email: 'john.doe@example.com',
        name: 'John Doe',
        role: 'user',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: '123e4567-e89b-12d3-a456-426614174001',
        email: 'jane.smith@example.com',
        name: 'Jane Smith',
        role: 'admin',
        createdAt: '2024-01-02T00:00:00.000Z',
        updatedAt: '2024-01-02T00:00:00.000Z',
      },
    ];

    return {
      data: mockUsers,
      total: 100,
      page: query.page || 1,
      limit: query.limit || 10,
      totalPages: Math.ceil(100 / (query.limit || 10)),
    };
  }

  @Get(':id')
  @Version('1')
  @SerializeOptions({ type: UserResponseDto })
  @ApiOperation({
    summary: 'Get user profile by ID',
    description: 'Returns safe public fields for the requested user profile.',
  })
  @ApiResponse({ status: 200, type: UserResponseDto })
  @ApiResponse({ status: 404, description: 'User not found' })
  async findOne(@Param('id') id: string): Promise<UserResponseDto> {
    const user = await this.usersService.findById(id);
    return new UserResponseDto(user);
  }

  @Post('me/data-export')
  @Version('1')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Request GDPR data export',
    description: 'Queues a job to collect all user data and email a presigned S3 download link.',
  })
  @ApiResponse({ status: 202, description: 'Export job queued' })
  async requestDataExport(
    @Request() req: { user: { id: string }; ip: string },
  ): Promise<{ message: string }> {
    await this.gdprService.requestDataExport(req.user.id, req.ip);
    return { message: 'Data export queued. You will receive an email with the download link.' };
  }

  @Delete('me')
  @Version('1')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Request account erasure (GDPR Art. 17)',
    description: 'Anonymizes PII and hard-deletes KYC records. 30-day cooldown enforced.',
  })
  @ApiResponse({ status: 202, description: 'Erasure job queued' })
  @ApiResponse({ status: 429, description: 'Erasure request already submitted within 30 days' })
  async requestErasure(
    @Request() req: { user: { id: string }; ip: string },
  ): Promise<{ message: string }> {
    await this.gdprService.requestErasure(req.user.id, req.ip);
    return { message: 'Erasure request queued. Your account will be anonymized shortly.' };
  }
}
