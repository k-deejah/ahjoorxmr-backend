import { Exclude, Expose } from 'class-transformer';

@Exclude()
export class UserResponseDto {
  @Expose()
  id: string;

  @Expose()
  walletAddress: string;

  @Expose()
  displayName: string | null;

  @Expose()
  email: string | null;

  @Expose()
  createdAt: Date;

  @Expose()
  updatedAt: Date;

  // refreshTokenHash is intentionally excluded

  constructor(partial: Partial<UserResponseDto>) {
    Object.assign(this, partial);
  }
}
