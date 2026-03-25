import { Controller, Get, Query, UseGuards, Version } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
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

@ApiTags('Users')
@Controller('users')
@UseGuards(JwtAuthGuard, RolesGuard)
export class UsersController {
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
}
