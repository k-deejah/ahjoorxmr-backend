import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  IsBoolean,
  Min,
  MinLength,
  Matches,
  IsTimeZone,
  MaxLength,
  ValidateIf,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

/**
 * DTO for the template configuration object.
 * Contains the reusable group settings.
 */
export class GroupTemplateConfigDto {
  @ApiProperty({
    description: 'Contribution amount per round',
    example: '100.00',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+(\.\d+)?$/, {
    message: 'contributionAmount must be a non-negative decimal number',
  })
  contributionAmount: string;

  @ApiProperty({
    description: 'Duration of each round in seconds',
    example: 2592000,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  roundDuration: number;

  @ApiProperty({
    description: 'Total number of rounds in the ROSCA cycle',
    example: 12,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  totalRounds: number;

  @ApiProperty({
    description: 'Maximum number of members allowed (must equal totalRounds)',
    example: 12,
  })
  @IsInt()
  @Min(1)
  maxMembers: number;

  @ApiProperty({
    description: 'Minimum number of members required to activate the group',
    example: 3,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  minMembers: number;

  @ApiPropertyOptional({
    description: 'Stellar asset code (defaults to XLM)',
    example: 'USDC',
    default: 'XLM',
  })
  @IsOptional()
  @IsString()
  @MaxLength(12)
  assetCode?: string;

  @ApiPropertyOptional({
    description: 'Stellar account ID of the asset issuer',
    example: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  })
  @ValidateIf((o) => o.assetCode && o.assetCode !== 'XLM')
  @IsString()
  @IsNotEmpty({ message: 'assetIssuer is required for non-XLM assets' })
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: 'assetIssuer must be a valid Stellar G-address',
  })
  assetIssuer?: string | null;

  @ApiPropertyOptional({
    description: 'Payout order strategy',
    example: 'SEQUENTIAL',
  })
  @IsOptional()
  @IsString()
  payoutOrderStrategy?: string;

  @ApiPropertyOptional({
    description: 'Penalty rate for missed contributions',
    example: 0.05,
  })
  @IsOptional()
  @IsInt()
  penaltyRate?: number;

  @ApiPropertyOptional({
    description: 'Grace period in hours before a member is penalized',
    example: 24,
  })
  @IsOptional()
  @IsInt()
  gracePeriodHours?: number;

  @ApiPropertyOptional({
    description: 'Timezone for the group',
    example: 'UTC',
  })
  @IsOptional()
  @IsTimeZone()
  timezone?: string | null;
}

/**
 * DTO for creating a new group template.
 * Can be created from scratch or from an existing group.
 */
export class CreateGroupTemplateDto {
  @ApiProperty({
    description: 'Name of the template',
    example: 'Monthly USDC Group',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  name: string;

  @ApiPropertyOptional({
    description: 'Description of the template',
    example: 'Template for monthly USDC contribution groups with 12 rounds',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Whether this template is publicly visible to all users',
    default: false,
  })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({
    description: 'Configuration object containing group settings. Required if fromGroupId is not provided.',
    type: GroupTemplateConfigDto,
  })
  @Type(() => GroupTemplateConfigDto)
  @IsOptional()
  @IsObject()
  config?: GroupTemplateConfigDto;

  @ApiPropertyOptional({
    description: 'Group ID to clone configuration from (instead of providing config directly)',
  })
  @IsOptional()
  @IsString()
  fromGroupId?: string;
}

/**
 * DTO for updating an existing group template.
 */
export class UpdateGroupTemplateDto {
  @ApiPropertyOptional({
    description: 'Name of the template',
    example: 'Monthly USDC Group',
  })
  @IsOptional()
  @IsString()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({
    description: 'Description of the template',
  })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @ApiPropertyOptional({
    description: 'Whether this template is publicly visible to all users',
  })
  @IsOptional()
  @IsBoolean()
  isPublic?: boolean;

  @ApiPropertyOptional({
    description: 'Configuration object containing group settings',
    type: GroupTemplateConfigDto,
  })
  @IsOptional()
  @Type(() => GroupTemplateConfigDto)
  config?: Partial<GroupTemplateConfigDto>;
}
