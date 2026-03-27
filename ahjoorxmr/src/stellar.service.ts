import { Injectable, Logger } from '@nestjs/common';
import * as StellarSdk from '@stellar/stellar-sdk';

@Injectable()
export class StellarService {
  private readonly logger = new Logger(StellarService.name);

  /**
   * Generates a cryptographically random challenge string for the
   * given wallet address.  The challenge is prefixed so it cannot
   * accidentally double as another meaningful payload.
   */
  generateChallenge(walletAddress: string): string {
    const nonce = StellarSdk.Keypair.random().secret().slice(0, 16);
    const ts = Math.floor(Date.now() / 1_000);
    return `cheese-wallet:auth:${walletAddress}:${ts}:${nonce}`;
  }

  /**
   * Verifies a detached Ed25519 signature over `challenge` produced
   * by the private key corresponding to `walletAddress`.
   *
   * @param walletAddress  Stellar G... public key
   * @param challenge      The exact string that was signed
   * @param signature      Base64-encoded signature bytes
   */
  verifySignature(
    walletAddress: string,
    challenge: string,
    signature: string,
  ): boolean {
    try {
      const keypair = StellarSdk.Keypair.fromPublicKey(walletAddress);
      const messageBuffer = Buffer.from(challenge, 'utf-8');
      const signatureBuffer = Buffer.from(signature, 'base64');
      return keypair.verify(messageBuffer, signatureBuffer);
    } catch (err) {
      this.logger.warn(
        `verifySignature failed for ${walletAddress}: ${(err as Error).message}`,
      );
      return false;
    }
  }

  /**
   * Validates that a string looks like a well-formed Stellar public key.
   */
  isValidPublicKey(address: string): boolean {
    try {
      StellarSdk.Keypair.fromPublicKey(address);
      return true;
    } catch {
      return false;
    }
  }
}
