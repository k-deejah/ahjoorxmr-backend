import {
  Controller,
  Post,
  Get,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  HttpCode,
  HttpStatus,
  ParseUUIDPipe,
  UseGuards,
  Request,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
} from '@nestjs/swagger';
import { GroupTemplatesService } from './group-templates.service';
import {
  CreateGroupTemplateDto,
  UpdateGroupTemplateDto,
} from './dto/group-template.dto';
import {
  GroupTemplateResponseDto,
  PaginatedGroupTemplatesResponseDto,
} from './dto/group-template-response.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { ApiKeyAuthGuard } from '../api-keys/guards/api-key-auth.guard';
import { KeyScopeGuard } from '../api-keys/guards/key-scope.guard';
import { RequireKeyScope } from '../api-keys/decorators/require-key-scope.decorator';
import { KeyScope } from '../api-keys/key-scope.enum';
import { AuditLog } from '../audit/decorators/audit-log.decorator';
import { ErrorResponseDto } from '../common/dto/error-response.dto';
import { GroupTemplate } from './entities/group-template.entity';

/**
 * Controller for managing group templates.
 * Provides REST API endpoints for creating, listing, updating, and deleting group templates.
 */
@ApiTags('Group Templates')
@Controller('group-templates')
@UseGuards(KeyScopeGuard)
export class GroupTemplatesController {
  constructor(private readonly groupTemplatesService: GroupTemplatesService) {}

  /**
   * Creates a new group template from scratch or cloned from an existing group.
   *
   * @param req - Authenticated request object
   * @param createDto - Template creation payload
   * @returns The created template
   */
  @Post()
  @UseGuards(JwtAuthGuard, ApiKeyAuthGuard)
  @RequireKeyScope(KeyScope.WRITE_GROUPS)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new group template',
    description:
      'Creates a new group template from scratch or cloned from an existing group via ?fromGroupId=',
  })
  @ApiBody({ type: CreateGroupTemplateDto })
  @ApiResponse({
    status: 201,
    description: 'Template created successfully',
    type: GroupTemplateResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token required',
    type: ErrorResponseDto,
  })
  @AuditLog({ action: 'CREATE', resource: 'GROUP_TEMPLATE' })
  async createTemplate(
    @Request() req: { user: { id: string } },
    @Body() createDto: CreateGroupTemplateDto,
  ): Promise<GroupTemplateResponseDto> {
    const template = await this.groupTemplatesService.createTemplate(
      createDto,
      req.user.id,
    );
    return this.toResponse(template);
  }

  /**
   * Returns paginated list of templates accessible to the user.
   * User sees: their own templates + all public templates.
   *
   * @param req - Authenticated request object
   * @param page - Page number (default: 1)
   * @param limit - Items per page (default: 10)
   * @param search - Optional search string to filter by name/description
   * @returns Paginated list of templates
   */
  @Get()
  @UseGuards(JwtAuthGuard, ApiKeyAuthGuard)
  @RequireKeyScope(KeyScope.READ_GROUPS)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get group templates',
    description:
      'Returns caller own templates plus all public templates; supports ?search= query param',
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
    description: 'Search string to filter templates by name or description',
    example: 'USDC',
  })
  @ApiResponse({
    status: 200,
    description: 'List of templates',
    type: PaginatedGroupTemplatesResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token required',
    type: ErrorResponseDto,
  })
  async getTemplates(
    @Request() req: { user: { id: string } },
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('search') search?: string,
  ): Promise<PaginatedGroupTemplatesResponseDto> {
    const result = await this.groupTemplatesService.findTemplates(
      req.user.id,
      page,
      limit,
      search,
    );
    return {
      data: result.data.map((t) => this.toResponse(t)),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  /**
   * Returns a single template (own or public).
   *
   * @param req - Authenticated request object
   * @param id - Template UUID
   * @returns The template
   */
  @Get(':id')
  @UseGuards(JwtAuthGuard, ApiKeyAuthGuard)
  @RequireKeyScope(KeyScope.READ_GROUPS)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get a single group template',
    description: 'Returns a single template if accessible to the user',
  })
  @ApiParam({
    name: 'id',
    description: 'Template UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 200,
    description: 'Template found',
    type: GroupTemplateResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - template is private and not owned by you',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Template not found',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token required',
    type: ErrorResponseDto,
  })
  async getTemplate(
    @Request() req: { user: { id: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<GroupTemplateResponseDto> {
    const template = await this.groupTemplatesService.findTemplateById(
      id,
      req.user.id,
    );
    return this.toResponse(template);
  }

  /**
   * Updates a template (owner only).
   *
   * @param req - Authenticated request object
   * @param id - Template UUID
   * @param updateDto - Partial template update
   * @returns The updated template
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard, ApiKeyAuthGuard)
  @RequireKeyScope(KeyScope.WRITE_GROUPS)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Update a group template',
    description: 'Updates a template; only the owner can update their templates',
  })
  @ApiParam({
    name: 'id',
    description: 'Template UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiBody({ type: UpdateGroupTemplateDto })
  @ApiResponse({
    status: 200,
    description: 'Template updated successfully',
    type: GroupTemplateResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - you can only update your own templates',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Template not found',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token required',
    type: ErrorResponseDto,
  })
  @AuditLog({ action: 'UPDATE', resource: 'GROUP_TEMPLATE' })
  async updateTemplate(
    @Request() req: { user: { id: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateDto: UpdateGroupTemplateDto,
  ): Promise<GroupTemplateResponseDto> {
    const template = await this.groupTemplatesService.updateTemplate(
      id,
      updateDto,
      req.user.id,
    );
    return this.toResponse(template);
  }

  /**
   * Soft-deletes a template (owner only).
   * Deleting a template does not affect groups already created from it.
   *
   * @param req - Authenticated request object
   * @param id - Template UUID
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard, ApiKeyAuthGuard)
  @RequireKeyScope(KeyScope.WRITE_GROUPS)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Delete a group template',
    description:
      'Soft-deletes a template; only the owner can delete their templates. Deleting a template does not affect groups created from it.',
  })
  @ApiParam({
    name: 'id',
    description: 'Template UUID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @ApiResponse({
    status: 204,
    description: 'Template deleted successfully',
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - you can only delete your own templates',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Template not found',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token required',
    type: ErrorResponseDto,
  })
  @AuditLog({ action: 'DELETE', resource: 'GROUP_TEMPLATE' })
  async deleteTemplate(
    @Request() req: { user: { id: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.groupTemplatesService.deleteTemplate(id, req.user.id);
  }

  /**
   * Converts a GroupTemplate entity to a response DTO.
   */
  private toResponse(template: GroupTemplate): GroupTemplateResponseDto {
    return {
      id: template.id,
      name: template.name,
      description: template.description,
      isPublic: template.isPublic,
      config: template.config as any,
      ownerId: template.ownerId,
      usageCount: template.usageCount,
      createdAt: template.createdAt?.toISOString() ?? new Date().toISOString(),
      updatedAt: template.updatedAt?.toISOString() ?? new Date().toISOString(),
    };
  }
}
