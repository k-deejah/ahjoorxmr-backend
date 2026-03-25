import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty } from 'class-validator';

export class Enable2FAResponseDto {
  @ApiProperty({ description: 'QR code data URL for authenticator app' })
  qrCode: string;

  @ApiProperty({ description: 'Secret key for manual entry' })
  secret: string;

  @ApiProperty({
    description: 'Backup codes for account recovery',
    type: [String],
  })
  backupCodes: string[];
}

export class Verify2FADto {
  @ApiProperty({ description: 'TOTP token from authenticator app' })
  @IsString()
  @IsNotEmpty()
  token: string;
}

export class Disable2FADto {
  @ApiProperty({ description: 'Current password' })
  @IsString()
  @IsNotEmpty()
  password: string;

  @ApiProperty({ description: 'Current TOTP token' })
  @IsString()
  @IsNotEmpty()
  token: string;
}

export class Login2FADto {
  @ApiProperty({ description: 'TOTP token or backup code' })
  @IsString()
  @IsNotEmpty()
  token: string;
}
