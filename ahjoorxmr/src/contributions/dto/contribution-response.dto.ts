import { ApiProperty } from '@nestjs/swagger';

/**
 * Response DTO for contribution data.
 * Returns all contribution fields with dates in ISO 8601 format.
 */
export class ContributionResponseDto {
  @ApiProperty({
    description: 'Contribution unique identifier',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'Group unique identifier',
    example: '123e4567-e89b-12d3-a456-426614174001',
  })
  groupId: string;

  @ApiProperty({
    description: 'User unique identifier',
    example: '123e4567-e89b-12d3-a456-426614174002',
  })
  userId: string;

  @ApiProperty({
    description: 'Stellar wallet address',
    example: 'GBXGQJWVLWOYHFLVTKWV5FGHA3LNYY2JQKM7OAJAUEQFU6LPCSEFVXON',
  })
  walletAddress: string;

  @ApiProperty({
    description: 'Round number for this contribution',
    example: 1,
    minimum: 1,
  })
  roundNumber: number;

  @ApiProperty({
    description: 'Contribution amount (stored as string)',
    example: '100.50',
  })
  amount: string;

  @ApiProperty({
    description: 'Stellar transaction hash',
    example: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6',
  })
  transactionHash: string;

  @ApiProperty({
    description: 'Transaction timestamp (ISO 8601)',
    example: '2024-01-01T00:00:00.000Z',
  })
  timestamp: string;

  @ApiProperty({
    description: 'Contribution creation timestamp (ISO 8601)',
    example: '2024-01-01T00:00:00.000Z',
  })
  createdAt: string;

  @ApiProperty({
    description: 'Last update timestamp (ISO 8601)',
    example: '2024-01-01T00:00:00.000Z',
  })
  updatedAt: string;
}
