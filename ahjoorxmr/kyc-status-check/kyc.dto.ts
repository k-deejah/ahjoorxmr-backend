import { IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { KycStatus } from './kyc.constants';

export class UpdateKycStatusDto {
  @IsEnum([KycStatus.APPROVED, KycStatus.REJECTED], {
    message: 'status must be either APPROVED or REJECTED',
  })
  status: KycStatus.APPROVED | KycStatus.REJECTED;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  reason?: string;
}

export class KycStatusResponseDto {
  userId: string;
  kycStatus: KycStatus;
  reason?: string;
  updatedAt: Date;
}

export class KycActionPayload {
  userId: string;
  status: KycStatus;
  reason?: string;
  performedBy: string;
}
