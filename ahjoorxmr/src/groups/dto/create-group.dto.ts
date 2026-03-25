import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  Min,
  MinLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for creating a new ROSCA group.
 * All fields are required except contractAddress which is assigned after on-chain deployment.
 */
export class CreateGroupDto {
  @ApiProperty({
    description: 'Name of the ROSCA group',
    example: 'Monthly Savings Group',
    minLength: 1,
  })
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
    description:
      'Contribution amount per round (stored as string to avoid floating-point precision loss)',
    example: '100.00',
    pattern: '^\\d+(\\.\\d+)?$',
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

  @ApiPropertyOptional({
    description:
      'On-chain contract address (optional at creation time, assigned after deployment)',
    example: 'CBXGQJWVLWOYHFLVTKWV5FGHA3LNYY2JQKM7OAJAUEQFU6LPCSEFVXON',
  })
  @IsOptional()
  @IsString()
  contractAddress?: string;
}
