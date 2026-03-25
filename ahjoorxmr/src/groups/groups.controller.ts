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
  ParseBoolPipe,
  Version,
  SetMetadata,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiDeprecatedResponse,
} from '@nestjs/swagger';
import { GroupsService } from './groups.service';
import { CreateGroupDto } from './dto/create-group.dto';
import { UpdateGroupDto } from './dto/update-group.dto';
import {
  GroupResponseDto,
  PaginatedGroupsResponseDto,
} from './dto/group-response.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { Group } from './entities/group.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { MembershipResponseDto } from '../memberships/dto/membership-response.dto';
import { AuditLog } from '../audit/decorators/audit-log.decorator';
import { ErrorResponseDto } from '../common/dto/error-response.dto';

/**
 * Controller for managing ROSCA groups.
 * Provides REST API endpoints for creating, listing, fetching, and updating groups.
 *
 * DEPRECATED: This is API v1. Use /api/v2/groups for the new version.
 * Breaking changes in v2:
 * - GET /api/v2/groups/:id no longer includes members
 * - Use GET /api/v2/groups/:id/members for member data
 *
 * IMPORTANT: The GET /my route is declared BEFORE GET /:id to prevent
 * NestJS from treating "my" as a UUID parameter.
 */
@ApiTags('Groups')
@Controller('groups')
@Version('1')
@SetMetadata('deprecated', true)
export class GroupsController {
  constructor(private readonly groupsService: GroupsService) {}

  /**
   * Creates a new ROSCA group with status PENDING.
   * The adminWallet is taken from the authenticated user's token payload.
   *
   * @param req - Authenticated request object (contains req.user from JwtAuthGuard)
   * @param createGroupDto - Group creation payload
   * @returns The created group as GroupResponseDto with HTTP 201
   */
  @Post()
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Create a new ROSCA group',
    description:
      'Creates a new ROSCA group with PENDING status. Requires authentication.',
  })
  @ApiBody({ type: CreateGroupDto })
  @ApiResponse({
    status: 201,
    description: 'Group created successfully',
    type: GroupResponseDto,
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
  @AuditLog({ action: 'CREATE', resource: 'GROUP' })
  async createGroup(
    @Request() req: { user: { id: string; walletAddress: string } },
    @Body() createGroupDto: CreateGroupDto,
  ): Promise<GroupResponseDto> {
    const adminWallet = req.user.walletAddress || req.user.id;
    const group = await this.groupsService.createGroup(
      createGroupDto,
      adminWallet,
    );
    return this.toGroupResponse(group);
  }

  /**
   * Returns a paginated list of all ROSCA groups.
   *
   * @param page - Page number (default: 1)
   * @param limit - Items per page (default: 10)
   * @param includeArchived - Include soft-deleted groups (default: false)
   * @param filter - Optional filter: 'stale' to return only stale groups
   * @returns Paginated list of groups
   */
  @Get()
  @ApiOperation({
    summary: 'Get all ROSCA groups with pagination',
    description: 'Returns a paginated list of all ROSCA groups',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page',
    example: 10,
  })
  @ApiQuery({
    name: 'includeArchived',
    required: false,
    type: Boolean,
    description: 'Include soft-deleted groups',
    example: false,
  })
  @ApiQuery({
    name: 'filter',
    required: false,
    type: String,
    description: 'Filter groups by status (e.g., "stale" for stale groups)',
    example: 'stale',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved groups',
    type: PaginatedGroupsResponseDto,
  })
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('includeArchived', new DefaultValuePipe(false), ParseBoolPipe)
    includeArchived: boolean,
    @Query('filter') filter?: string,
  ): Promise<PaginatedGroupsResponseDto> {
    const result = await this.groupsService.findAll(
      page,
      limit,
      includeArchived,
      filter,
    );
    return {
      data: result.data.map((g) => this.toGroupResponse(g)),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  /**
   * Returns all groups the authenticated user belongs to as a member.
   * MUST be declared before GET /:id to avoid route conflict.
   *
   * @param req - Authenticated request object
   * @returns Array of groups the user is a member of
   */
  @Get('my')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Get my groups',
    description:
      'Returns all groups the authenticated user belongs to as a member',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved user groups',
    type: [GroupResponseDto],
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token required',
    type: ErrorResponseDto,
  })
  async findMyGroups(
    @Request() req: { user: { id: string } },
  ): Promise<GroupResponseDto[]> {
    const userId = req.user.id;
    const groups = await this.groupsService.findMyGroups(userId);
    return groups.map((g) => this.toGroupResponse(g));
  }

  /**
   * Returns full group details including members.
   *
   * @param id - The UUID of the group
   * @returns Full group details with members array
   * @throws NotFoundException if the group doesn't exist
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get group by ID',
    description: 'Returns full group details including members array',
  })
  @ApiParam({ name: 'id', description: 'Group UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved group',
    type: GroupResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Group not found',
    type: ErrorResponseDto,
  })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<GroupResponseDto> {
    const group = await this.groupsService.findOne(id);
    return this.toGroupResponse(group, true);
  }

  /**
   * Updates group metadata. Admin-only — only the group admin may update.
   * Updates are only permitted while the group is in PENDING status.
   *
   * @param req - Authenticated request object
   * @param id - The UUID of the group
   * @param updateGroupDto - Fields to update
   * @returns The updated group
   * @throws NotFoundException if the group doesn't exist
   * @throws BadRequestException if the group is not PENDING
   * @throws ForbiddenException if not the group admin
   */
  @Patch(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Update group',
    description:
      'Updates group metadata. Only group admin can update and only while group is PENDING',
  })
  @ApiParam({ name: 'id', description: 'Group UUID', format: 'uuid' })
  @ApiBody({ type: UpdateGroupDto })
  @ApiResponse({
    status: 200,
    description: 'Group updated successfully',
    type: GroupResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data or group not in PENDING status',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token required',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - only group admin can update',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Group not found',
    type: ErrorResponseDto,
  })
  @AuditLog({ action: 'UPDATE', resource: 'GROUP' })
  async update(
    @Request() req: { user: { id: string; walletAddress: string } },
    @Param('id', ParseUUIDPipe) id: string,
    @Body() updateGroupDto: UpdateGroupDto,
  ): Promise<GroupResponseDto> {
    const adminWallet = req.user.walletAddress || req.user.id;
    const group = await this.groupsService.update(
      id,
      updateGroupDto,
      adminWallet,
    );
    return this.toGroupResponse(group);
  }

  /**
   * Soft-deletes a group (archive). Admin-only — only the group admin may delete.
   *
   * @param req - Authenticated request object
   * @param id - The UUID of the group
   * @throws NotFoundException if the group doesn't exist
   * @throws ForbiddenException if not the group admin
   */
  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Archive (soft-delete) a group',
    description:
      'Soft-deletes a group by setting deletedAt. Only the group admin can delete.',
  })
  @ApiParam({ name: 'id', description: 'Group UUID', format: 'uuid' })
  @ApiResponse({ status: 204, description: 'Group archived successfully' })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - only group admin can delete',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Group not found',
    type: ErrorResponseDto,
  })
  @AuditLog({ action: 'DELETE', resource: 'GROUP' })
  async remove(
    @Request() req: { user: { id: string; walletAddress: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const adminWallet = req.user.walletAddress || req.user.id;
    await this.groupsService.softDelete(id, adminWallet);
  }

  /**
   * Advances a PENDING group if all conditions are met.
   * Only the group admin can activate the group.
   * The group must have enough members to meet the minimum requirement.
   *
   * @param req - Authenticated request object
   * @param id - The UUID of the group to activate
   * @returns The updated group with status ACTIVE
   * @throws NotFoundException if the group doesn't exist
   * @throws ForbiddenException if not the group admin
   * @throws BadRequestException if the group is not PENDING or doesn't have enough members
   */
  @Post(':id/activate')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Activate group',
    description:
      'Activates a PENDING group if all conditions are met. Only group admin can activate.',
  })
  @ApiParam({ name: 'id', description: 'Group UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Group activated successfully',
    type: GroupResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Group not in PENDING status or insufficient members',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized - JWT token required',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 403,
    description: 'Forbidden - only group admin can activate',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Group not found',
    type: ErrorResponseDto,
  })
  @AuditLog({ action: 'ACTIVATE', resource: 'GROUP' })
  async activateGroup(
    @Request() req: { user: { id: string; walletAddress: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<GroupResponseDto> {
    const adminWallet = req.user.walletAddress || req.user.id;
    const group = await this.groupsService.activateGroup(id, adminWallet);
    return this.toGroupResponse(group);
  }

  /**
   * Advances the group to the next round.
   * Only the group admin can advance a round.
   * All members must have paid their current round contribution.
   *
   * @param req - Authenticated request object
   * @param id - The UUID of the group
   * @returns The updated group
   * @throws NotFoundException if the group doesn't exist
   * @throws ForbiddenException if not the group admin
   * @throws BadRequestException if the group is not ACTIVE or members haven't paid
   */
  @Post(':id/advance-round')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async advanceRound(
    @Request() req: { user: { id: string; walletAddress: string } },
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<GroupResponseDto> {
    const adminWallet = req.user.walletAddress || req.user.id;
    const group = await this.groupsService.advanceRound(id, adminWallet);
    return this.toGroupResponse(group);
  }

  /**
   * Retrieves the on-chain contract state for a specific group.
   * Returns the current state from the Stellar smart contract.
   *
   * @param id - The UUID of the group
   * @returns The on-chain contract state
   * @throws NotFoundException if the group doesn't exist
   * @throws BadRequestException if the group has no contract address
   */
  @Get(':id/contract-state')
  @ApiOperation({
    summary: 'Get group contract state',
    description:
      'Retrieves the on-chain contract state for a specific group from the Stellar blockchain',
  })
  @ApiParam({ name: 'id', description: 'Group UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved contract state',
  })
  @ApiResponse({
    status: 400,
    description: 'Group has no contract address',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Group not found',
    type: ErrorResponseDto,
  })
  async getContractState(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<unknown> {
    return this.groupsService.getContractState(id);
  }

  /**
   * Maps a Group entity to a GroupResponseDto.
   * @param group - The group entity
   * @param includeMembers - Whether to include the memberships array
   */
  private toGroupResponse(
    group: Group,
    includeMembers = false,
  ): GroupResponseDto {
    const dto: GroupResponseDto = {
      id: group.id,
      name: group.name,
      contractAddress: group.contractAddress,
      adminWallet: group.adminWallet,
      contributionAmount: group.contributionAmount,
      token: group.token,
      roundDuration: group.roundDuration,
      status: group.status,
      currentRound: group.currentRound,
      totalRounds: group.totalRounds,
      createdAt: group.createdAt.toISOString(),
      updatedAt: group.updatedAt.toISOString(),
      staleAt: group.staleAt ? group.staleAt.toISOString() : null,
    };

    if (includeMembers && group.memberships) {
      dto.members = group.memberships.map((m: Membership) =>
        this.toMembershipResponse(m),
      );
    }

    return dto;
  }

  /**
   * Maps a Membership entity to a MembershipResponseDto.
   */
  private toMembershipResponse(membership: Membership): MembershipResponseDto {
    return {
      id: membership.id,
      groupId: membership.groupId,
      userId: membership.userId,
      walletAddress: membership.walletAddress,
      payoutOrder: membership.payoutOrder,
      hasReceivedPayout: membership.hasReceivedPayout,
      hasPaidCurrentRound: membership.hasPaidCurrentRound,
      status: membership.status,
      createdAt: membership.createdAt.toISOString(),
      updatedAt: membership.updatedAt.toISOString(),
    };
  }
}
