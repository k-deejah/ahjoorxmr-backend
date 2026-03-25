import {
  Controller,
  Get,
  Param,
  Query,
  ParseUUIDPipe,
  DefaultValuePipe,
  ParseIntPipe,
  ParseBoolPipe,
  Version,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { GroupsService } from './groups.service';
import {
  GroupResponseDtoV2,
  PaginatedGroupsResponseDtoV2,
} from './dto/group-response-v2.dto';
import { Group } from './entities/group.entity';
import { Membership } from '../memberships/entities/membership.entity';
import { MembershipResponseDto } from '../memberships/dto/membership-response.dto';
import { ErrorResponseDto } from '../common/dto/error-response.dto';

/**
 * Controller for managing ROSCA groups (API v2).
 * This is a new version with breaking changes:
 * - GET /api/v2/groups/:id no longer includes members
 * - GET /api/v2/groups/:id/members is a dedicated endpoint for members
 *
 * IMPORTANT: The GET /my route is declared BEFORE GET /:id to prevent
 * NestJS from treating "my" as a UUID parameter.
 */
@ApiTags('Groups V2')
@Controller('groups')
@Version('2')
export class GroupsV2Controller {
  constructor(private readonly groupsService: GroupsService) {}

  /**
   * Returns a paginated list of all ROSCA groups (without members).
   *
   * @param page - Page number (default: 1)
   * @param limit - Items per page (default: 10)
   * @returns Paginated list of groups
   */
  @Get()
  @ApiOperation({
    summary: 'Get all ROSCA groups with pagination',
    description:
      'Returns a paginated list of all ROSCA groups (v2: without members)',
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
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved groups',
    type: PaginatedGroupsResponseDtoV2,
  })
  async findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
    @Query('includeArchived', new DefaultValuePipe(false), ParseBoolPipe)
    includeArchived: boolean,
  ): Promise<PaginatedGroupsResponseDtoV2> {
    const result = await this.groupsService.findAll(
      page,
      limit,
      includeArchived,
    );
    return {
      data: result.data.map((g) => this.toGroupResponseV2(g)),
      total: result.total,
      page: result.page,
      limit: result.limit,
    };
  }

  /**
   * Returns full group details (without members).
   * To get members, use GET /api/v2/groups/:id/members
   *
   * @param id - The UUID of the group
   * @returns Group details without members array
   * @throws NotFoundException if the group doesn't exist
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Get group by ID',
    description:
      'Returns group details without members. Use GET /api/v2/groups/:id/members for members.',
  })
  @ApiParam({ name: 'id', description: 'Group UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved group',
    type: GroupResponseDtoV2,
  })
  @ApiResponse({
    status: 404,
    description: 'Group not found',
    type: ErrorResponseDto,
  })
  async findOne(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<GroupResponseDtoV2> {
    const group = await this.groupsService.findOne(id);
    return this.toGroupResponseV2(group);
  }

  /**
   * Returns the list of members for a specific group.
   * This is a dedicated endpoint for member data (v2 breaking change).
   *
   * @param id - The UUID of the group
   * @returns Array of members in the group
   * @throws NotFoundException if the group doesn't exist
   */
  @Get(':id/members')
  @ApiOperation({
    summary: 'Get group members',
    description: 'Returns the list of members for a specific group',
  })
  @ApiParam({ name: 'id', description: 'Group UUID', format: 'uuid' })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved group members',
    type: [MembershipResponseDto],
  })
  @ApiResponse({
    status: 404,
    description: 'Group not found',
    type: ErrorResponseDto,
  })
  async getGroupMembers(
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<MembershipResponseDto[]> {
    const group = await this.groupsService.findOne(id);
    if (!group.memberships) {
      return [];
    }
    return group.memberships.map((m: Membership) =>
      this.toMembershipResponse(m),
    );
  }

  /**
   * Maps a Group entity to a GroupResponseDtoV2 (without members).
   */
  private toGroupResponseV2(group: Group): GroupResponseDtoV2 {
    return {
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
    };
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
