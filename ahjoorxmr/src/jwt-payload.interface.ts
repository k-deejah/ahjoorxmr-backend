export interface JwtPayload {
  /** Stellar public key — primary identifier */
  walletAddress: string;

  /** Optional email for legacy / email-password accounts */
  email?: string;

  /** Internal user UUID */
  sub: string;

  /** Auth method used to obtain this token */
  authMethod: 'wallet' | 'password';

  iat?: number;
  exp?: number;
}
