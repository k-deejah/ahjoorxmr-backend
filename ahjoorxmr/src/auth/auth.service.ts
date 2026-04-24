import {
  Injectable,
  UnauthorizedException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
  Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, IsNull } from 'typeorm';
import * as bcrypt from 'bcrypt';
import * as crypto from 'crypto';
import { UsersService } from '../users/users.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';
import { TwoFactorService } from './two-factor.service';
import { StellarService } from '../stellar/stellar.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { MailService } from '../mail/mail.service';

export interface StoreTokenOptions {
  deviceId?: string;
  deviceName?: string;
  ipAddress?: string;
  /** Carry forward the absolute expiry from the previous token on rotation. */
  absoluteExpiresAt?: Date;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly twoFactorService: TwoFactorService,
    private readonly stellarService: StellarService,
    private readonly mailService: MailService,
    @InjectRepository(RefreshToken)
    private readonly refreshTokenRepository: Repository<RefreshToken>,
  ) {}

  async registerWithWallet(
    walletAddress: string,
    signature: string,
    challenge: string,
    opts?: StoreTokenOptions,
  ) {
    const isValid = this.stellarService.verifySignature(walletAddress, challenge, signature);
    if (!isValid) {
      throw new UnauthorizedException('Invalid signature');
    }

    let user = await this.usersService.findByWalletAddress(walletAddress);
    if (!user) {
      user = await this.usersService.create({ walletAddress, role: 'user', isActive: true });
    }

    const tokens = await this.generateTokens(user.walletAddress, user.email || '', user.role);
    await this.storeRefreshToken(user.id, tokens.refreshToken, opts);
    return tokens;
  }

  async register(registerDto: RegisterDto, opts?: StoreTokenOptions) {
    const { email, password, firstName, lastName } = registerDto;

    const existingUser = await this.usersService.findByEmail(email);
    if (existingUser) {
      throw new ConflictException('Email already exists');
    }

    const hashedPassword = await this.hashPassword(password);
    const user = await this.usersService.create({
      email,
      password: hashedPassword,
      firstName,
      lastName,
      walletAddress: `internal-${Date.now()}`,
      role: 'user',
    });

    const tokens = await this.generateTokens(user.walletAddress, user.email || '', user.role);
    await this.storeRefreshToken(user.id, tokens.refreshToken, opts);
    return tokens;
  }

  async login(loginDto: LoginDto, opts?: StoreTokenOptions) {
    const { email, password } = loginDto;
    const user = await this.usersService.findByEmail(email);

    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await this.comparePassword(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.twoFactorEnabled) {
      const preAuthToken = this.twoFactorService.issuePreAuthToken(user.id, user.email ?? '', user.role);
      throw new ForbiddenException({ message: '2FA verification required', preAuthToken, twoFactorRequired: true });
    }

    const tokens = await this.generateTokens(user.walletAddress, user.email || '', user.role);
    await this.storeRefreshToken(user.id, tokens.refreshToken, opts);
    return tokens;
  }

  /**
   * Rotates the refresh token.
   * - Verifies JWT signature.
   * - Checks absolute expiry (session lifetime cap).
   * - Detects reuse: if the token is already revoked, revokes ALL sessions and sends a security alert.
   * - Issues a new token carrying forward the absoluteExpiresAt.
   */
  async refreshTokens(incomingRefreshToken: string, opts?: StoreTokenOptions) {
    let payload: any;
    try {
      payload = await this.jwtService.verifyAsync(incomingRefreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET') || 'default_refresh_secret',
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const tokenHash = this.hashToken(incomingRefreshToken);
    const stored = await this.refreshTokenRepository.findOne({ where: { tokenHash } });

    const now = new Date();

    // Reuse detection: token exists but is already revoked
    if (stored && stored.revokedAt !== null) {
      this.logger.warn(`Refresh token reuse detected for user ${stored.userId}`);
      await this.revokeAllUserTokens(stored.userId);
      await this.sendSecurityAlert(stored.userId);
      throw new UnauthorizedException('Access Denied');
    }

    // Token not found or already expired
    if (!stored || stored.expiresAt < now) {
      if (stored?.userId) {
        await this.revokeAllUserTokens(stored.userId);
      }
      throw new UnauthorizedException('Access Denied');
    }

    // Absolute session expiry check
    if (stored.absoluteExpiresAt < now) {
      stored.revokedAt = now;
      await this.refreshTokenRepository.save(stored);
      throw new UnauthorizedException('Session has expired. Please log in again.');
    }

    // Rotate: revoke old token
    stored.revokedAt = now;
    await this.refreshTokenRepository.save(stored);

    const user = await this.usersService.findById(stored.userId);
    const newTokenVersion = await this.usersService.incrementTokenVersion(user.id);

    const tokens = await this.generateTokens(user.walletAddress, user.email || '', user.role, newTokenVersion);
    // Carry forward the absolute expiry from the original session
    await this.storeRefreshToken(user.id, tokens.refreshToken, {
      ...opts,
      absoluteExpiresAt: stored.absoluteExpiresAt,
    });

    return tokens;
  }

  /**
   * Lists active (non-revoked, non-expired) sessions for a user.
   */
  async listSessions(userId: string): Promise<Array<{
    id: string;
    deviceId: string | null;
    deviceName: string | null;
    ipAddress: string | null;
    lastUsedAt: Date;
    absoluteExpiresAt: Date;
    createdAt: Date;
  }>> {
    const now = new Date();
    const tokens = await this.refreshTokenRepository.find({
      where: { userId, revokedAt: IsNull() },
      order: { lastUsedAt: 'DESC' },
    });

    return tokens
      .filter((t) => t.expiresAt > now && t.absoluteExpiresAt > now)
      .map((t) => ({
        id: t.id,
        deviceId: t.deviceId,
        deviceName: t.deviceName,
        ipAddress: t.ipAddress,
        lastUsedAt: t.lastUsedAt,
        absoluteExpiresAt: t.absoluteExpiresAt,
        createdAt: t.createdAt,
      }));
  }

  /**
   * Revokes a single session by its ID. Only the owning user may revoke.
   */
  async revokeSession(userId: string, sessionId: string): Promise<void> {
    const token = await this.refreshTokenRepository.findOne({ where: { id: sessionId } });
    if (!token || token.userId !== userId) {
      throw new NotFoundException('Session not found');
    }
    token.revokedAt = new Date();
    await this.refreshTokenRepository.save(token);
  }

  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      const tokenHash = this.hashToken(refreshToken);
      await this.refreshTokenRepository.update({ tokenHash }, { revokedAt: new Date() });
    } else {
      await this.revokeAllUserTokens(userId);
    }
    await this.usersService.revokeAllSessions(userId);
  }

  async revokeAllUserTokens(userId: string): Promise<void> {
    await this.refreshTokenRepository.update(
      { userId, revokedAt: IsNull() as any },
      { revokedAt: new Date() },
    );
    await this.usersService.revokeAllSessions(userId);
  }

  async deleteExpiredTokens(): Promise<number> {
    const result = await this.refreshTokenRepository.delete({
      expiresAt: LessThan(new Date()),
    });
    return result.affected ?? 0;
  }

  async verifyRefreshToken(token: string) {
    return this.jwtService.verifyAsync(token, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET') || 'default_refresh_secret',
    });
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  async getUserForTokenGeneration(userId: string) {
    return this.usersService.findById(userId);
  }

  async generateTokens(sub: string, email: string, role: string, tokenVersion?: number) {
    const user = await this.usersService.findByWalletAddress(sub);
    const version = tokenVersion ?? user.tokenVersion ?? 0;

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub, userId: user.id, email, role, tokenVersion: version },
        {
          secret: this.configService.get<string>('JWT_ACCESS_SECRET') || 'default_access_secret',
          expiresIn: '15m',
        },
      ),
      this.jwtService.signAsync(
        { sub, userId: user.id, email, role, tokenVersion: version },
        {
          secret: this.configService.get<string>('JWT_REFRESH_SECRET') || 'default_refresh_secret',
          expiresIn: '7d',
        },
      ),
    ]);

    return { accessToken, refreshToken };
  }

  /** @deprecated Use storeRefreshToken instead */
  async updateRefreshToken(userId: string, refreshToken: string) {
    await this.storeRefreshToken(userId, refreshToken);
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private async storeRefreshToken(
    userId: string,
    refreshToken: string,
    opts?: StoreTokenOptions,
  ): Promise<void> {
    const tokenHash = this.hashToken(refreshToken);
    const slidingDays = 7;
    const expiresAt = new Date(Date.now() + slidingDays * 24 * 60 * 60 * 1000);

    // Absolute expiry: carry forward from rotation, or set fresh from env
    const absoluteDays = this.configService.get<number>('REFRESH_TOKEN_ABSOLUTE_EXPIRY_DAYS', 30);
    const absoluteExpiresAt =
      opts?.absoluteExpiresAt ?? new Date(Date.now() + absoluteDays * 24 * 60 * 60 * 1000);

    const record = this.refreshTokenRepository.create({
      userId,
      tokenHash,
      expiresAt,
      absoluteExpiresAt,
      deviceId: opts?.deviceId ?? null,
      deviceName: opts?.deviceName ?? null,
      ipAddress: opts?.ipAddress ?? null,
    });
    await this.refreshTokenRepository.save(record);
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  private async sendSecurityAlert(userId: string): Promise<void> {
    try {
      const user = await this.usersService.findById(userId);
      if (user?.email) {
        await this.mailService.sendMail({
          to: user.email,
          subject: 'Security Alert: Suspicious login activity detected',
          html: `<p>We detected suspicious activity on your account. All active sessions have been revoked. If this was not you, please reset your password immediately.</p>`,
        });
      }
    } catch (err) {
      this.logger.error(`Failed to send security alert for user ${userId}: ${err.message}`);
    }
  }
}
