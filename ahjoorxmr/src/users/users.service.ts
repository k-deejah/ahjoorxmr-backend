import { Injectable, NotFoundException } from '@nestjs/common';
import { UserRepository } from './repositories/user.repository';
import { User } from './entities/user.entity';

@Injectable()
export class UsersService {
  constructor(private readonly userRepository: UserRepository) { }

  async findById(id: string): Promise<User> {
    const user = await this.userRepository.findOne({ where: { id } });
    if (!user) {
      throw new NotFoundException('User not found');
    }
    return user;
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.userRepository.findByEmail(email);
  }

  async findByWalletAddress(walletAddress: string): Promise<User | null> {
    return this.userRepository.findByWalletAddress(walletAddress);
  }

  async create(userData: Partial<User>): Promise<User> {
    const user = this.userRepository.create(userData);
    return this.userRepository.save(user);
  }

  async updateRefreshToken(
    userId: string,
    refreshTokenHash: string | null,
  ): Promise<void> {
    await this.userRepository.update(userId, { refreshTokenHash });
  }

  async incrementTokenVersion(userId: string): Promise<number> {
    const user = await this.findById(userId);
    const newVersion = (user.tokenVersion || 0) + 1;
    await this.userRepository.update(userId, { tokenVersion: newVersion });
    return newVersion;
  }

  async revokeAllSessions(userId: string): Promise<void> {
    await this.userRepository.update(userId, {
      refreshTokenHash: null,
      tokenVersion: (await this.findById(userId)).tokenVersion + 1,
    });
  }

  async upsertByWalletAddress(walletAddress: string): Promise<User> {
    let user = await this.findByWalletAddress(walletAddress);
    if (!user) {
      user = await this.create({ walletAddress });
    }
    return user;
  }
}
