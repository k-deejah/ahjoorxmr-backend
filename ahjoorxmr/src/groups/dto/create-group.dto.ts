import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  Min,
  MinLength,
  Matches,
  IsTimeZone,
  IsDateString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for creating a new ROSCA group.
 * All fields are required except contractAddress which is assigned after on-chain deployment.
 */
export class CreateGroupDto {
  @ApiProperty({ description: 'Name of the ROSCA group', example: 'Monthly Savings Group' })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  name: string;

  @ApiProperty({
    description: 'Stellar wallet address of the group administrator',
    example: 'GBXGQJWVLWOYHFLVTKWV5FGHA3LNYY2JQKM7OAJAUEQFU6LPCSEFVXON',
  })
  @IsString()
  @IsNotEmpty()
  adminWallet: string;

  @ApiProperty({
    description: 'Contribution amount per round (stored as string to avoid floating-point precision loss)',
    example: '100.00',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+(\.\d+)?$/, {
    message: 'contributionAmount must be a non-negative decimal number',
  })
  contributionAmount: string;

  @ApiProperty({
    description: 'Token contract address (e.g. Stellar asset identifier)',
    example: 'USDC:GBXGQJWVLWOYHFLVTKWV5FGHA3LNYY2JQKM7OAJAUEQFU6LPCSEFVXON',
  })
  @IsString()
  @IsNotEmpty()
  token: string;

  @ApiPropertyOptional({
    description: 'Stellar asset code for contributions/payouts. Defaults to XLM (native). Max 12 chars.',
    example: 'USDC',
    default: 'XLM',
  })
  @IsOptional()
  @IsString()
  @MaxLength(12)
  assetCode?: string;

  @ApiPropertyOptional({
    description: 'Stellar account ID of the asset issuer. Required when assetCode is not XLM.',
    example: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
  })
  @ValidateIf((o) => o.assetCode && o.assetCode !== 'XLM')
  @IsString()
  @IsNotEmpty({ message: 'assetIssuer is required for non-XLM assets' })
  @Matches(/^G[A-Z2-7]{55}$/, { message: 'assetIssuer must be a valid Stellar G-address' })
  assetIssuer?: string;

  @ApiProperty({ description: 'Duration of each round in seconds', example: 2592000, minimum: 1 })
  @IsInt()
  @Min(1)
  roundDuration: number;

  @ApiProperty({ description: 'Total number of rounds in the ROSCA cycle', example: 12, minimum: 1 })
  @IsInt()
  @Min(1)
  totalRounds: number;

  @ApiProperty({ description: 'Minimum number of members required to activate the group', example: 3, minimum: 1 })
  @IsInt()
  @Min(1)
  minMembers: number;

  @ApiPropertyOptional({ description: 'Maximum number of members allowed (must equal totalRounds)', example: 12 })
  @IsOptional()
  @IsInt()
  @Min(1)
  maxMembers?: number;

  @ApiPropertyOptional({
    description: 'On-chain contract address (optional at creation time, assigned after deployment)',
    example: 'CBXGQJWVLWOYHFLVTKWV5FGHA3LNYY2JQKM7OAJAUEQFU6LPCSEFVXON',
  })
  @IsOptional()
  @IsString()
  contractAddress?: string;

  @ApiPropertyOptional({ description: 'IANA timezone for the contribution window', example: 'America/New_York' })
  @IsOptional()
  @IsTimeZone()
  timezone?: string;

  @ApiPropertyOptional({ description: 'Contribution window start date (ISO 8601)', example: '2024-01-01T00:00:00Z' })
  @IsOptional()
  @IsDateString()
  startDate?: string;

  @ApiPropertyOptional({ description: 'Contribution window end date (ISO 8601)', example: '2024-12-31T23:59:59Z' })
  @IsOptional()
  @IsDateString()
  endDate?: string;

  @ApiPropertyOptional({
    description: 'Payout order strategy (e.g., SEQUENTIAL, RANDOM)',
    example: 'SEQUENTIAL',
  })
  @IsOptional()
  @IsString()
  payoutOrderStrategy?: string;

  @ApiPropertyOptional({
    description: 'Penalty rate for missed contributions (0-1)',
    example: 0.05,
  })
  @IsOptional()
  penaltyRate?: number;

  @ApiPropertyOptional({
    description: 'Grace period in hours before a member is penalized',
    example: 24,
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  gracePeriodHours?: number;

  @ApiPropertyOptional({
    description: 'UUID of a group template to use as base configuration. When provided, template config is merged as defaults (explicit DTO fields override template values).',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @IsOptional()
  @IsString()
  templateId?: string;
}
