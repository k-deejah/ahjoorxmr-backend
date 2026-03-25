import {
  Controller,
  Post,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Body,
  ParseUUIDPipe,
  UseGuards,
  Request,
  Version,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiBody,
} from '@nestjs/swagger';
import { MembershipsService } from './memberships.service';
import { CreateMembershipDto } from './dto/create-membership.dto';
import { MembershipResponseDto } from './dto/membership-response.dto';
import { RecordPayoutDto } from './dto/record-payout.dto';
import { JwtAuthGuard } from '../groups/guards/jwt-auth.guard';
import { AuditLog } from '../audit/decorators/audit-log.decorator';
import { ErrorResponseDto } from '../common/dto/error-response.dto';

/**
 * Controller for managing ROSCA group memberships.
 * Provides REST API endpoints for adding, removing, and listing group members.
 */
@ApiTags('Memberships')
@Controller('groups')
@Version('1')
export class MembershipsController {
  constructor(private readonly membershipsService: MembershipsService) {}

  /**
   * Adds a new member to a ROSCA group.
   * Only allowed before the group becomes active.
   *
   * @param groupId - The UUID of the group (validated by ParseUUIDPipe)
   * @param createMembershipDto - The membership data (userId and walletAddress)
   * @returns The created membership with HTTP 201 status
   * @throws BadRequestException if the group is active or doesn't exist
   * @throws ConflictException if the user is already a member
   */
  @Post(':id/members')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Add member to group',
    description:
      'Adds a new member to a ROSCA group. Only allowed before the group becomes active.',
  })
  @ApiParam({ name: 'id', description: 'Group UUID', format: 'uuid' })
  @ApiBody({ type: CreateMembershipDto })
  @ApiResponse({
    status: 201,
    description: 'Member added successfully',
    type: MembershipResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data or group is already active',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Group not found',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'User is already a member of this group',
    type: ErrorResponseDto,
  })
  @AuditLog({ action: 'CREATE', resource: 'MEMBERSHIP' })
  async addMember(
    @Param('id', ParseUUIDPipe) groupId: string,
    @Body() createMembershipDto: CreateMembershipDto,
  ): Promise<MembershipResponseDto> {
    const membership = await this.membershipsService.addMember(
      groupId,
      createMembershipDto,
    );

    return {
      id: membership.id,
      groupId: membership.groupId,
      userId: membership.userId,
      walletAddress: membership.walletAddress,
      payoutOrder: membership.payoutOrder,
      hasReceivedPayout: membership.hasReceivedPayout,
      hasPaidCurrentRound: membership.hasPaidCurrentRound,
      transactionHash: membership.transactionHash,
      status: membership.status,
      createdAt: membership.createdAt.toISOString(),
      updatedAt: membership.updatedAt.toISOString(),
    };
  }

  /**
   * Removes a member from a ROSCA group.
   * Only allowed before the group becomes active.
   *
   * @param groupId - The UUID of the group (validated by ParseUUIDPipe)
   * @param userId - The UUID of the user to remove (validated by ParseUUIDPipe)
   * @returns No content with HTTP 204 status
   * @throws BadRequestException if the group is active or doesn't exist
   * @throws NotFoundException if the membership doesn't exist
   */
  @Delete(':id/members/:userId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Remove member from group',
    description:
      'Removes a member from a ROSCA group. Only allowed before the group becomes active.',
  })
  @ApiParam({ name: 'id', description: 'Group UUID', format: 'uuid' })
  @ApiParam({ name: 'userId', description: 'User UUID', format: 'uuid' })
  @ApiResponse({
    status: 204,
    description: 'Member removed successfully',
  })
  @ApiResponse({
    status: 400,
    description: 'Group is already active',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Group or membership not found',
    type: ErrorResponseDto,
  })
  @AuditLog({ action: 'DELETE', resource: 'MEMBERSHIP' })
  async removeMember(
    @Param('id', ParseUUIDPipe) groupId: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ): Promise<void> {
    await this.membershipsService.removeMember(groupId, userId);
  }

  /**
   * Lists all members of a ROSCA group.
   * Returns members ordered by payout order (position in the payout queue).
   *
   * @param groupId - The UUID of the group (validated by ParseUUIDPipe)
   * @returns Array of memberships with HTTP 200 status
   */
  @Get(':id/members')
  @ApiOperation({
    summary: 'List group members',
    description: 'Lists all members of a ROSCA group, ordered by payout order',
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
  async listMembers(
    @Param('id', ParseUUIDPipe) groupId: string,
  ): Promise<MembershipResponseDto[]> {
    const memberships = await this.membershipsService.listMembers(groupId);

    return memberships.map((membership) => ({
      id: membership.id,
      groupId: membership.groupId,
      userId: membership.userId,
      walletAddress: membership.walletAddress,
      payoutOrder: membership.payoutOrder,
      hasReceivedPayout: membership.hasReceivedPayout,
      hasPaidCurrentRound: membership.hasPaidCurrentRound,
      transactionHash: membership.transactionHash,
      status: membership.status,
      createdAt: membership.createdAt.toISOString(),
      updatedAt: membership.updatedAt.toISOString(),
    }));
  }

  /**
   * Allows a member to leave a PENDING group (self-service).
   * Members can only leave before the group becomes active.
   *
   * @param groupId - The UUID of the group
   * @param req - The authenticated request containing user information
   * @returns No content with HTTP 204 status
   * @throws BadRequestException if the group is ACTIVE or COMPLETED
   * @throws NotFoundException if the membership doesn't exist
   */
  @Delete(':id/members/me')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Leave group (self-service)',
    description:
      'Allows a member to leave a PENDING group. Only allowed before the group becomes active.',
  })
  @ApiParam({ name: 'id', description: 'Group UUID', format: 'uuid' })
  @ApiResponse({
    status: 204,
    description: 'Successfully left the group',
  })
  @ApiResponse({
    status: 400,
    description: 'Group is ACTIVE or COMPLETED, cannot leave',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Group or membership not found',
    type: ErrorResponseDto,
  })
  @AuditLog({ action: 'DELETE', resource: 'MEMBERSHIP' })
  async leaveGroup(
    @Param('id', ParseUUIDPipe) groupId: string,
    @Request() req: any,
  ): Promise<void> {
    const userId = req.user.userId;
    await this.membershipsService.leaveGroup(groupId, userId);
  }

  /**
   * Records a payout to a member.
   * Admin-only endpoint that marks a member as having received their payout.
   *
   * @param groupId - The UUID of the group
   * @param recordPayoutDto - Payout details (recipientUserId and transactionHash)
   * @returns The updated membership with HTTP 200 status
   * @throws NotFoundException if group or membership doesn't exist
   * @throws BadRequestException if group is not ACTIVE
   * @throws ConflictException if member already received payout
   */
  @Post(':id/payout')
  @UseGuards(JwtAuthGuard)
  @HttpCode(HttpStatus.OK)
  async recordPayout(
    @Param('id', ParseUUIDPipe) groupId: string,
    @Body() recordPayoutDto: RecordPayoutDto,
  ): Promise<MembershipResponseDto> {
    const membership = await this.membershipsService.recordPayout(
      groupId,
      recordPayoutDto.recipientUserId,
      recordPayoutDto.transactionHash,
    );

    return {
      id: membership.id,
      groupId: membership.groupId,
      userId: membership.userId,
      walletAddress: membership.walletAddress,
      payoutOrder: membership.payoutOrder,
      hasReceivedPayout: membership.hasReceivedPayout,
      hasPaidCurrentRound: membership.hasPaidCurrentRound,
      transactionHash: membership.transactionHash,
      status: membership.status,
      createdAt: membership.createdAt.toISOString(),
      updatedAt: membership.updatedAt.toISOString(),
    };
  }
}
