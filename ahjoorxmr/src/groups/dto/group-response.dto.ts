import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GroupStatus } from '../entities/group-status.enum';
import { MembershipResponseDto } from '../../memberships/dto/membership-response.dto';

/**
 * Response DTO for a single group.
 * Dates are returned as ISO 8601 strings for consistency.
 * Members are only included for the GET /:id endpoint.
 */
export class GroupResponseDto {
  @ApiProperty({
    description: 'Group unique identifier',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'Name of the ROSCA group',
    example: 'Monthly Savings Group',
  })
  name: string;

  @ApiProperty({
    description: 'On-chain contract address (null if not yet deployed)',
    example: 'CBXGQJWVLWOYHFLVTKWV5FGHA3LNYY2JQKM7OAJAUEQFU6LPCSEFVXON',
    nullable: true,
  })
  contractAddress: string | null;

  @ApiProperty({
    description: 'Stellar wallet address of the group administrator',
    example: 'GBXGQJWVLWOYHFLVTKWV5FGHA3LNYY2JQKM7OAJAUEQFU6LPCSEFVXON',
  })
  adminWallet: string;

  @ApiProperty({
    description: 'Contribution amount per round',
    example: '100.00',
  })
  contributionAmount: string;

  @ApiProperty({
    description: 'Token contract address',
    example: 'USDC:GBXGQJWVLWOYHFLVTKWV5FGHA3LNYY2JQKM7OAJAUEQFU6LPCSEFVXON',
  })
  token: string;

  @ApiProperty({
    description: 'Duration of each round in seconds',
    example: 2592000,
  })
  roundDuration: number;

  @ApiProperty({
    description: 'Current status of the group',
    enum: GroupStatus,
    example: GroupStatus.ACTIVE,
  })
  status: GroupStatus;

  @ApiProperty({
    description: 'Current round number (0 = not started)',
    example: 1,
    minimum: 0,
  })
  currentRound: number;

  @ApiProperty({
    description: 'Total number of rounds in the ROSCA cycle',
    example: 12,
  })
  totalRounds: number;

  @ApiProperty({
    description: 'Group creation timestamp (ISO 8601)',
    example: '2024-01-01T00:00:00.000Z',
  })
  createdAt: string;

  @ApiProperty({
    description: 'Last update timestamp (ISO 8601)',
    example: '2024-01-01T00:00:00.000Z',
  })
  updatedAt: string;

  @ApiPropertyOptional({
    description: 'Timestamp when the group was flagged as stale (ISO 8601)',
    example: '2024-01-15T00:00:00.000Z',
    nullable: true,
  })
  staleAt?: string | null;

  @ApiPropertyOptional({
    description: 'List of group members (only included for GET /:id endpoint)',
    type: [MembershipResponseDto],
  })
  members?: MembershipResponseDto[];
}

/**
 * Response DTO for a paginated list of groups.
 */
export class PaginatedGroupsResponseDto {
  @ApiProperty({
    description: 'Array of groups',
    type: [GroupResponseDto],
  })
  data: GroupResponseDto[];

  @ApiProperty({
    description: 'Total number of groups',
    example: 100,
  })
  total: number;

  @ApiProperty({
    description: 'Current page number',
    example: 1,
  })
  page: number;

  @ApiProperty({
    description: 'Number of items per page',
    example: 20,
  })
  limit: number;
}
