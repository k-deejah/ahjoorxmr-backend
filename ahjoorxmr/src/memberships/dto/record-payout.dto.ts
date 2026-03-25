import { IsString, IsNotEmpty, IsUUID } from 'class-validator';

export class RecordPayoutDto {
  @IsUUID()
  @IsNotEmpty()
  recipientUserId: string;

  @IsString()
  @IsNotEmpty()
  transactionHash: string;
}
