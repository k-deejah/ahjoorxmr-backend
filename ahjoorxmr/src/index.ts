// Core module
export { AuthModule } from './auth.module';

// Service
export { AuthService } from './auth.service';

// Entities
export { User, MembershipTier } from './entities/user.entity';

// DTOs
export {
  GetChallengeDto,
  VerifyChallengeDto,
  RegisterDto,
  LoginDto,
} from './dto/auth.dto';

// Interfaces
export { JwtPayload } from './interfaces/jwt-payload.interface';
export { AuthenticatedRequest } from './interfaces/authenticated-request.interface';

// Guards
export { JwtAuthGuard } from './guards/jwt-auth.guard';

// Decorators
export {
  Public,
  CurrentUser,
  WalletAddress,
  IS_PUBLIC_KEY,
} from './decorators/public.decorator';

// Stores
export { ChallengeStore } from './challenge.store';
