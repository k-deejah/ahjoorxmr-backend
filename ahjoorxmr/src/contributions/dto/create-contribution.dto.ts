import {
  IsUUID,
  IsNotEmpty,
  IsString,
  MinLength,
  IsInt,
  Min,
  IsDate,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

export class CreateContributionDto {
  @ApiProperty({
    description: 'Group unique identifier',
    example: '123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty()
  groupId: string;

  @ApiProperty({
    description: 'User unique identifier',
    example: '123e4567-e89b-12d3-a456-426614174001',
    format: 'uuid',
  })
  @IsUUID()
  @IsNotEmpty()
  userId: string;

  @ApiProperty({
    description: 'Stellar wallet address',
    example: 'GBXGQJWVLWOYHFLVTKWV5FGHA3LNYY2JQKM7OAJAUEQFU6LPCSEFVXON',
    minLength: 1,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  walletAddress: string;

  @ApiProperty({
    description: 'Round number for this contribution',
    example: 1,
    minimum: 1,
  })
  @IsInt()
  @Min(1)
  roundNumber: number;

  @ApiProperty({
    description:
      'Contribution amount (stored as string to avoid floating-point precision issues)',
    example: '100.50',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  amount: string;

  @ApiProperty({
    description: 'Stellar transaction hash',
    example: 'a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6',
    minLength: 1,
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(1)
  transactionHash: string;

  @ApiProperty({
    description: 'Transaction timestamp',
    example: '2024-01-01T00:00:00.000Z',
    type: String,
    format: 'date-time',
  })
  @IsDate()
  @Type(() => Date)
  timestamp: Date;
}
