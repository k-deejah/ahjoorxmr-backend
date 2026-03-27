import {
  IsString,
  IsNotEmpty,
  IsEmail,
  IsOptional,
  MinLength,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

// ---------------------------------------------------------------------------
// Wallet Auth DTOs
// ---------------------------------------------------------------------------

export class GetChallengeDto {
  @ApiProperty({
    description: 'Stellar public key (G... address)',
    example: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: 'walletAddress must be a valid Stellar public key',
  })
  walletAddress: string;
}

export class VerifyChallengeDto {
  @ApiProperty({
    description: 'Stellar public key (G... address)',
    example: 'GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN',
  })
  @IsString()
  @IsNotEmpty()
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: 'walletAddress must be a valid Stellar public key',
  })
  walletAddress: string;

  @ApiProperty({
    description: 'Base64-encoded Stellar signature of the challenge string',
  })
  @IsString()
  @IsNotEmpty()
  signature: string;

  @ApiProperty({
    description: 'The exact challenge string that was signed',
  })
  @IsString()
  @IsNotEmpty()
  challenge: string;
}

// ---------------------------------------------------------------------------
// Email / Password Auth DTOs  (legacy — still supported)
// ---------------------------------------------------------------------------

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password: string;

  @ApiPropertyOptional({
    description: 'Optional Stellar wallet to link at registration time',
  })
  @IsOptional()
  @IsString()
  @Matches(/^G[A-Z2-7]{55}$/, {
    message: 'walletAddress must be a valid Stellar public key',
  })
  walletAddress?: string;
}

export class LoginDto {
  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  password: string;
}
