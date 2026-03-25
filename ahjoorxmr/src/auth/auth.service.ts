import {
  Injectable,
  UnauthorizedException,
  ConflictException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcrypt';
import { UsersService } from '../users/users.service';
import { RegisterDto, LoginDto } from './dto/auth.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly usersService: UsersService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
  ) { }

  async register(registerDto: RegisterDto) {
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
      walletAddress: `internal-${Date.now()}`, // Placeholder for internal users
      role: 'user',
    });

    const tokens = await this.generateTokens(
      user.id,
      user.email || '',
      user.role,
    );
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  async login(loginDto: LoginDto) {
    const { email, password } = loginDto;
    const user = await this.usersService.findByEmail(email);

    if (!user || !user.password) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isPasswordValid = await this.comparePassword(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const tokens = await this.generateTokens(
      user.id,
      user.email || '',
      user.role,
    );
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  async refreshTokens(userId: string, refreshToken: string) {
    const user = await this.usersService.findById(userId);
    if (!user || !user.refreshTokenHash) {
      throw new UnauthorizedException('Access Denied');
    }

    const isRefreshTokenValid = await bcrypt.compare(
      refreshToken,
      user.refreshTokenHash,
    );
    if (!isRefreshTokenValid) {
      // Token theft detected - revoke all sessions
      await this.usersService.revokeAllSessions(userId);
      throw new UnauthorizedException('Access Denied');
    }

    // Increment token version for rotation
    const newTokenVersion = await this.usersService.incrementTokenVersion(userId);

    const tokens = await this.generateTokens(
      user.id,
      user.email || '',
      user.role,
      newTokenVersion,
    );
    await this.updateRefreshToken(user.id, tokens.refreshToken);

    return tokens;
  }

  async verifyRefreshToken(token: string) {
    return this.jwtService.verifyAsync(token, {
      secret:
        this.configService.get<string>('JWT_REFRESH_SECRET') ||
        'default_refresh_secret',
    });
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }

  private async generateTokens(userId: string, email: string, role: string, tokenVersion?: number) {
    const user = await this.usersService.findById(userId);
    const version = tokenVersion ?? user.tokenVersion ?? 0;

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(
        { sub: userId, email, role, tokenVersion: version },
        {
          secret:
            this.configService.get<string>('JWT_ACCESS_SECRET') ||
            'default_access_secret',
          expiresIn: '15m',
        },
      ),
      this.jwtService.signAsync(
        { sub: userId, email, role, tokenVersion: version },
        {
          secret:
            this.configService.get<string>('JWT_REFRESH_SECRET') ||
            'default_refresh_secret',
          expiresIn: '7d',
        },
      ),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  async updateRefreshToken(userId: string, refreshToken: string) {
    const hash = await this.hashPassword(refreshToken);
    await this.usersService.updateRefreshToken(userId, hash);
  }

  async logout(userId: string): Promise<void> {
    await this.usersService.revokeAllSessions(userId);
  }
}
