import {
  BadRequestException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import * as StellarSdk from '@stellar/stellar-sdk';
import { RedisService } from '../common/redis/redis.service';
import { UsersService } from '../users/users.service';
import { JwtPayload } from './jwt.strategy';
import { RedisService } from '../common/redis/redis.service';

@Injectable()
export class AuthService {
  private readonly CHALLENGE_TTL_SECONDS = 300; // 5 minutes
  private readonly CHALLENGE_PREFIX = 'siws:challenge:';

  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService,
  ) {}

  async generateChallenge(walletAddress: string): Promise<string> {
    const nonce = crypto.randomBytes(32).toString('hex');
    const timestamp = Date.now();
    const challenge = `Sign this message to authenticate with Cheese Platform.\n\nWallet: ${walletAddress}\nNonce: ${nonce}\nTimestamp: ${timestamp}`;

    const redisKey = `${this.CHALLENGE_PREFIX}${walletAddress}`;
    await this.redisService.setWithExpiry(
      redisKey,
      challenge,
      this.CHALLENGE_TTL_SECONDS,
    );

    return challenge;
  }

  async verifySignature(
    walletAddress: string,
    signature: string,
    challenge: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    // Validate challenge exists in Redis (replay protection)
    const redisKey = `${this.CHALLENGE_PREFIX}${walletAddress}`;
    const storedChallenge = await this.redisService.get<string>(redisKey);

    if (!storedChallenge) {
      throw new UnauthorizedException('Challenge expired or not found');
    }

    if (storedChallenge !== challenge) {
      throw new UnauthorizedException('Challenge mismatch');
    }

    // Verify Stellar signature using transaction envelope
    const isValid = this.verifyStellarSignature(
      walletAddress,
      signature,
      challenge,
    );
    if (!isValid) {
      throw new UnauthorizedException('Invalid signature');
    }

    // Invalidate challenge after single use (replay protection)
    await this.redisService.del(redisKey);

    // Upsert user
    const user = await this.usersService.upsertByWalletAddress(walletAddress);

    // Issue tokens
    const tokens = await this.issueTokens(user.id, walletAddress);

    // Store refresh token hash
    const refreshTokenHash = this.hashToken(tokens.refreshToken);
    await this.usersService.updateRefreshTokenHash(user.id, refreshTokenHash);

    return tokens;
  }

  async refreshAccessToken(
    refreshToken: string,
  ): Promise<{ accessToken: string }> {
    let payload: JwtPayload;
    try {
      payload = await this.jwtService.verifyAsync<JwtPayload>(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('Invalid refresh token');
    }

    const user = await this.usersService.findByWalletAddress(
      payload.walletAddress,
    );
    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Refresh token revoked');
    }

    const tokenHash = this.hashToken(refreshToken);
    if (tokenHash !== user.refreshTokenHash) {
      throw new UnauthorizedException('Refresh token mismatch');
    }

    const accessToken = await this.issueAccessToken(
      user.id,
      user.walletAddress,
    );
    return { accessToken };
  }

  async logout(walletAddress: string): Promise<void> {
    const user = await this.usersService.findByWalletAddress(walletAddress);
    if (user) {
      await this.usersService.updateRefreshTokenHash(user.id, null);
    }
  }

  private verifyStellarSignature(
    walletAddress: string,
    signature: string,
    challenge: string,
  ): boolean {
    try {
      const keyPair = StellarSdk.Keypair.fromPublicKey(walletAddress);
      const messageBuffer = Buffer.from(challenge, 'utf8');
      const signatureBuffer = Buffer.from(signature, 'base64');
      return keyPair.verify(messageBuffer, signatureBuffer);
    } catch {
      return false;
    }
  }

  private async issueTokens(
    userId: string,
    walletAddress: string,
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const [accessToken, refreshToken] = await Promise.all([
      this.issueAccessToken(userId, walletAddress),
      this.issueRefreshToken(userId, walletAddress),
    ]);
    return { accessToken, refreshToken };
  }

  private async issueAccessToken(
    userId: string,
    walletAddress: string,
  ): Promise<string> {
    const payload: JwtPayload = { sub: userId, walletAddress };
    return this.jwtService.signAsync(payload, {
      privateKey: this.configService.get<string>('JWT_PRIVATE_KEY'),
      algorithm: 'RS256',
      expiresIn: this.configService.get<string>('JWT_ACCESS_EXPIRES_IN', '15m'),
    });
  }

  private async issueRefreshToken(
    userId: string,
    walletAddress: string,
  ): Promise<string> {
    const payload: JwtPayload = { sub: userId, walletAddress };
    return this.jwtService.signAsync(payload, {
      secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      algorithm: 'HS256',
      expiresIn: this.configService.get<string>('JWT_REFRESH_EXPIRES_IN', '7d'),
    });
  }

  private hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }
}
