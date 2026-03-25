import {
  IsString,
  IsNotEmpty,
  IsInt,
  IsOptional,
  Min,
  MinLength,
  Matches,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO for updating an existing ROSCA group.
 * All fields are optional — only provided fields will be updated.
 * Status changes are handled internally by the service, not via this DTO.
 */
export class UpdateGroupDto {
  @ApiPropertyOptional({
    description: 'Name of the ROSCA group',
    example: 'Monthly Savings Group',
    minLength: 1,
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  name?: string;

  @ApiPropertyOptional({
    description: 'Stellar wallet address of the group administrator',
    example: 'GBXGQJWVLWOYHFLVTKWV5FGHA3LNYY2JQKM7OAJAUEQFU6LPCSEFVXON',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  adminWallet?: string;

  @ApiPropertyOptional({
    description: 'Contribution amount per round (stored as string)',
    example: '100.00',
    pattern: '^\\d+(\\.\\d+)?$',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @Matches(/^\d+(\.\d+)?$/, {
    message: 'contributionAmount must be a non-negative decimal number',
  })
  contributionAmount?: string;

  @ApiPropertyOptional({
    description: 'Token contract address',
    example: 'USDC:GBXGQJWVLWOYHFLVTKWV5FGHA3LNYY2JQKM7OAJAUEQFU6LPCSEFVXON',
  })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  token?: string;

  @ApiPropertyOptional({
    description: 'Duration of each round in seconds',
    example: 2592000,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  roundDuration?: number;

  @ApiPropertyOptional({
    description: 'Total number of rounds in the ROSCA cycle',
    example: 12,
    minimum: 1,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  totalRounds?: number;

  @IsOptional()
  @IsString()
  contractAddress?: string;
}
