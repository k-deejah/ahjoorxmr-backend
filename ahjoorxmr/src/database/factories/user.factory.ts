import { Injectable } from '@nestjs/common';
import { User } from '../../users/entities/user.entity';

/**
 * Factory for generating User entities with realistic test data.
 */
@Injectable()
export class UserFactory {
  private readonly firstNames = [
    'Alice',
    'Bob',
    'Charlie',
    'Diana',
    'Eve',
    'Frank',
    'Grace',
    'Henry',
    'Ivy',
    'Jack',
    'Kate',
    'Leo',
    'Maya',
    'Noah',
    'Olivia',
    'Peter',
    'Quinn',
    'Rachel',
    'Sam',
    'Tina',
  ];

  private readonly lastNames = [
    'Smith',
    'Johnson',
    'Williams',
    'Brown',
    'Jones',
    'Garcia',
    'Miller',
    'Davis',
    'Rodriguez',
    'Martinez',
    'Hernandez',
    'Lopez',
    'Gonzalez',
    'Wilson',
    'Anderson',
    'Thomas',
    'Taylor',
    'Moore',
    'Jackson',
    'Martin',
  ];

  /**
   * Creates a new User entity with random data.
   */
  create(): User {
    const user = new User();
    user.twoFactorEnabled = Math.random() < 0.3; // 30% have 2FA enabled
    user.twoFactorSecret = user.twoFactorEnabled
      ? this.generateSecret()
      : undefined;
    user.backupCodes = user.twoFactorEnabled
      ? this.generateBackupCodes()
      : undefined;
    return user;
  }

  /**
   * Creates multiple User entities.
   */
  createMany(count: number): User[] {
    return Array.from({ length: count }, () => this.create());
  }

  /**
   * Generates a random 2FA secret.
   */
  private generateSecret(): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
    let secret = '';
    for (let i = 0; i < 32; i++) {
      secret += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return secret;
  }

  /**
   * Generates backup codes for 2FA.
   */
  private generateBackupCodes(): string[] {
    const codes: string[] = [];
    for (let i = 0; i < 10; i++) {
      codes.push(Math.random().toString(36).substring(2, 10).toUpperCase());
    }
    return codes;
  }

  /**
   * Generates a random name.
   */
  private generateName(): string {
    const firstName =
      this.firstNames[Math.floor(Math.random() * this.firstNames.length)];
    const lastName =
      this.lastNames[Math.floor(Math.random() * this.lastNames.length)];
    return `${firstName} ${lastName}`;
  }
}
