import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';

import { User } from './entities/user.entity';
import { StellarService } from '../stellar/stellar.service';
import { ChallengeStore } from './challenge.store';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { RegisterDto } from './dto/auth.dto';

const BCRYPT_ROUNDS = 12;

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,

    private readonly jwtService: JwtService,
    private readonly stellarService: StellarService,
    private readonly challengeStore: ChallengeStore,
  ) {}

  // -------------------------------------------------------------------------
  // Challenge helpers
  // -------------------------------------------------------------------------

  /**
   * Issues a short-lived challenge that the client must sign with their
   * Stellar private key.
   */
  generateChallenge(walletAddress: string): { challenge: string } {
    if (!this.stellarService.isValidPublicKey(walletAddress)) {
      throw new BadRequestException('Invalid Stellar public key format');
    }

    const challenge = this.stellarService.generateChallenge(walletAddress);
    this.challengeStore.set(walletAddress, challenge);
    return { challenge };
  }

  // -------------------------------------------------------------------------
  // Wallet-first registration / login
  // -------------------------------------------------------------------------

  /**
   * PRIMARY AUTH PATH.
   *
   * Validates the signed challenge, then upserts a User record whose
   * primary identifier is `walletAddress`.  If the wallet is new, a user
   * is created; if it already exists, the call acts as a login.
   *
   * Email is completely optional — a user can exist with only a wallet.
   */
  async registerWithWallet(
    walletAddress: string,
    signature: string,
    challenge: string,
  ): Promise<{ accessToken: string; user: Partial<User>; isNew: boolean }> {
    // 1. Validate public key format
    if (!this.stellarService.isValidPublicKey(walletAddress)) {
      throw new BadRequestException('Invalid Stellar public key format');
    }

    // 2. Validate challenge exists, is not expired, and matches exactly
    const challengeValid = this.challengeStore.consume(walletAddress, challenge);
    if (!challengeValid) {
      throw new UnauthorizedException(
        'Challenge is invalid, expired, or already used',
      );
    }

    // 3. Verify the Ed25519 signature
    const signatureValid = this.stellarService.verifySignature(
      walletAddress,
      challenge,
      signature,
    );
    if (!signatureValid) {
      this.logger.warn(
        `Invalid signature attempt for wallet ${walletAddress}`,
      );
      throw new UnauthorizedException('Invalid signature');
    }

    // 4. Upsert user
    let user = await this.userRepo.findOne({ where: { walletAddress } });
    const isNew = !user;

    if (!user) {
      user = this.userRepo.create({ walletAddress });
      await this.userRepo.save(user);
      this.logger.log(`New wallet user registered: ${walletAddress}`);
    } else {
      this.logger.log(`Wallet login: ${walletAddress}`);
    }

    // 5. Issue JWT with walletAddress as primary claim
    const payload: JwtPayload = {
      sub: user.id,
      walletAddress: user.walletAddress!,
      email: user.email ?? undefined,
      authMethod: 'wallet',
    };

    const accessToken = this.jwtService.sign(payload);
    return { accessToken, user: this.sanitize(user), isNew };
  }

  // -------------------------------------------------------------------------
  // Legacy email / password auth (preserved)
  // -------------------------------------------------------------------------

  async register(
    dto: RegisterDto,
  ): Promise<{ accessToken: string; user: Partial<User> }> {
    const existing = await this.userRepo.findOne({
      where: { email: dto.email },
    });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    // If a walletAddress was provided, ensure it is not already taken
    if (dto.walletAddress) {
      const walletTaken = await this.userRepo.findOne({
        where: { walletAddress: dto.walletAddress },
      });
      if (walletTaken) {
        throw new ConflictException('Wallet address already linked to an account');
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, BCRYPT_ROUNDS);

    const user = this.userRepo.create({
      email: dto.email,
      passwordHash,
      // Real wallet if provided; null otherwise — no placeholder addresses
      walletAddress: dto.walletAddress ?? null,
    });

    await this.userRepo.save(user);

    const payload: JwtPayload = {
      sub: user.id,
      walletAddress: user.walletAddress ?? `pending-${user.id}`,
      email: user.email ?? undefined,
      authMethod: 'password',
    };

    const accessToken = this.jwtService.sign(payload);
    return { accessToken, user: this.sanitize(user) };
  }

  async login(
    email: string,
    password: string,
  ): Promise<{ accessToken: string; user: Partial<User> }> {
    const user = await this.userRepo.findOne({
      where: { email },
      select: [
        'id',
        'email',
        'walletAddress',
        'passwordHash',
        'tier',
        'isActive',
      ],
    });

    if (!user || !user.passwordHash) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const passwordMatch = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatch) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = {
      sub: user.id,
      walletAddress: user.walletAddress ?? `pending-${user.id}`,
      email: user.email ?? undefined,
      authMethod: 'password',
    };

    const accessToken = this.jwtService.sign(payload);
    return { accessToken, user: this.sanitize(user) };
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  async findById(id: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { id } });
  }

  async findByWallet(walletAddress: string): Promise<User | null> {
    return this.userRepo.findOne({ where: { walletAddress } });
  }

  private sanitize(user: User): Partial<User> {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { passwordHash, ...safe } = user as any;
    return safe;
  }
}
