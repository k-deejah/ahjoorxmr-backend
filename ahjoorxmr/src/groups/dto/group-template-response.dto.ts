import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Configuration object in the response.
 */
export class GroupTemplateConfigResponseDto {
  @ApiProperty()
  contributionAmount: string;

  @ApiProperty()
  roundDuration: number;

  @ApiProperty()
  totalRounds: number;

  @ApiProperty()
  maxMembers: number;

  @ApiProperty()
  minMembers: number;

  @ApiPropertyOptional()
  assetCode?: string;

  @ApiPropertyOptional()
  assetIssuer?: string | null;

  @ApiPropertyOptional()
  payoutOrderStrategy?: string;

  @ApiPropertyOptional()
  penaltyRate?: number;

  @ApiPropertyOptional()
  gracePeriodHours?: number;

  @ApiPropertyOptional()
  timezone?: string | null;
}

/**
 * Response DTO for a single group template.
 */
export class GroupTemplateResponseDto {
  @ApiProperty({
    description: 'Template unique identifier',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  id: string;

  @ApiProperty({
    description: 'Name of the template',
    example: 'Monthly USDC Group',
  })
  name: string;

  @ApiPropertyOptional({
    description: 'Description of the template',
    example: 'Template for monthly USDC contribution groups with 12 rounds',
  })
  description: string | null;

  @ApiProperty({
    description: 'Whether this template is publicly visible',
  })
  isPublic: boolean;

  @ApiProperty({
    description: 'Configuration object',
    type: GroupTemplateConfigResponseDto,
  })
  config: GroupTemplateConfigResponseDto;

  @ApiProperty({
    description: 'UUID of the template owner',
  })
  ownerId: string;

  @ApiProperty({
    description: 'Number of times this template has been used to create a group',
  })
  usageCount: number;

  @ApiProperty({
    description: 'Template creation timestamp',
    example: '2025-01-15T10:30:00Z',
  })
  createdAt: string;

  @ApiProperty({
    description: 'Template last update timestamp',
    example: '2025-01-15T10:30:00Z',
  })
  updatedAt: string;
}

/**
 * Paginated response for group templates.
 */
export class PaginatedGroupTemplatesResponseDto {
  @ApiProperty({
    description: 'Array of group templates',
    type: [GroupTemplateResponseDto],
  })
  data: GroupTemplateResponseDto[];

  @ApiProperty({
    description: 'Total number of templates',
  })
  total: number;

  @ApiProperty({
    description: 'Current page number',
  })
  page: number;

  @ApiProperty({
    description: 'Items per page',
  })
  limit: number;
}
