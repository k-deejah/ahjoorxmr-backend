import { Injectable } from '@nestjs/common';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import * as crypto from 'crypto';

@Injectable()
export class TwoFactorService {
  /**
   * Generate a secret for TOTP
   */
  generateSecret(): string {
    return authenticator.generateSecret();
  }

  /**
   * Generate QR code data URL for authenticator app
   */
  async generateQRCode(email: string, secret: string): Promise<string> {
    const otpauth = authenticator.keyuri(email, 'Ahjoorxmr', secret);
    return QRCode.toDataURL(otpauth);
  }

  /**
   * Verify TOTP token
   */
  verifyToken(token: string, secret: string): boolean {
    try {
      return authenticator.verify({ token, secret });
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate backup codes for account recovery
   */
  generateBackupCodes(count: number = 8): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(code);
    }
    return codes;
  }

  /**
   * Hash backup code for storage
   */
  hashBackupCode(code: string): string {
    return crypto.createHash('sha256').update(code).digest('hex');
  }

  /**
   * Verify backup code against hashed codes
   */
  verifyBackupCode(code: string, hashedCodes: string[]): boolean {
    const hashedInput = this.hashBackupCode(code);
    return hashedCodes.includes(hashedInput);
  }
}
