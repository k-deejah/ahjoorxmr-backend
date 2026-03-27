# Wallet-Based Auth — Implementation Guide

## What Changed

| Before | After |
|--------|-------|
| `walletAddress` was `internal-${Date.now()}` placeholder | Real Stellar G… key or `null` |
| Email was required for registration | Email is optional |
| No signature verification on registration | Ed25519 challenge-response enforced |
| JWT `sub` was user UUID only | JWT carries `walletAddress` + `authMethod` |
| `JwtAuthGuard` had no concept of wallet identity | Strategy re-fetches DB walletAddress on every request |

---

## File Map

```
src/
├── app.module.ts                          ← integration example
├── auth/
│   ├── index.ts                           ← barrel exports
│   ├── auth.module.ts                     ← global JwtAuthGuard via APP_GUARD
│   ├── auth.service.ts                    ← registerWithWallet() + legacy register/login
│   ├── challenge.store.ts                 ← in-memory TTL store for challenges
│   ├── stellar-auth.controller.ts         ← HTTP endpoints
│   ├── dto/auth.dto.ts                    ← GetChallengeDto, VerifyChallengeDto, …
│   ├── entities/user.entity.ts            ← walletAddress primary, email optional
│   ├── interfaces/
│   │   ├── jwt-payload.interface.ts       ← walletAddress in JWT
│   │   └── authenticated-request.interface.ts
│   ├── guards/jwt-auth.guard.ts           ← honours @Public()
│   ├── decorators/public.decorator.ts     ← @Public(), @CurrentUser(), @WalletAddress()
│   └── strategies/jwt.strategy.ts        ← validates + re-hydrates from DB
├── stellar/
│   ├── stellar.module.ts
│   ├── stellar.service.ts                 ← generateChallenge + verifySignature
│   └── index.ts
└── migrations/
    └── 1712345678901-WalletPrimaryAuth.ts ← handles both fresh + existing DBs
```

---

## Auth Flow (Primary Path)

```
Client                             Server
  │                                  │
  │  POST /auth/wallet/challenge      │
  │  { walletAddress: "G..." }        │
  │ ─────────────────────────────────►│
  │                                  │  1. validate G... format
  │                                  │  2. generate nonce challenge
  │                                  │  3. store in ChallengeStore (TTL 5 min)
  │◄─────────────────────────────────│
  │  { challenge: "cheese-wallet:..." }
  │                                  │
  │  sign(challenge) with privateKey  │
  │                                  │
  │  POST /auth/wallet/verify         │
  │  { walletAddress, signature,      │
  │    challenge }                    │
  │ ─────────────────────────────────►│
  │                                  │  4. consume challenge (one-time, TTL check)
  │                                  │  5. Ed25519 verify(walletAddress, challenge, sig)
  │                                  │  6. upsert User row
  │                                  │  7. sign JWT { sub, walletAddress, authMethod }
  │◄─────────────────────────────────│
  │  { accessToken, isNew, user }     │
```

---

## Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| `POST` | `/auth/wallet/challenge` | Public | Issue sign challenge |
| `POST` | `/auth/wallet/verify` | Public | Verify signature → JWT |
| `POST` | `/auth/register` | Public | Legacy email/password register |
| `POST` | `/auth/login` | Public | Legacy email/password login |
| `GET` | `/auth/me` | JWT | Return current user |

---

## Using Decorators in Other Controllers

```typescript
import { Controller, Get } from '@nestjs/common';
import { CurrentUser, WalletAddress, Public } from 'src/auth';
import { JwtPayload } from 'src/auth';

@Controller('payments')
export class PaymentController {
  @Get('balance')
  getBalance(@WalletAddress() wallet: string) {
    // wallet === 'GAAZI4...'
  }

  @Get('profile')
  getProfile(@CurrentUser() user: JwtPayload) {
    // user.walletAddress, user.email, user.authMethod
  }

  @Public()
  @Get('fee-schedule')
  getFees() {
    // no JWT required
  }
}
```

---

## Running Tests

```bash
# Unit tests (no DB required)
npm test

# With coverage
npm run test:cov

# E2E / integration tests (uses SQLite in-memory)
npm run test:e2e
```

### Install better-sqlite3 for E2E tests

```bash
npm install -D better-sqlite3 @types/better-sqlite3
```

---

## Environment Variables

```env
JWT_SECRET=your-secret-minimum-32-characters-long
JWT_EXPIRES_IN=7d
DATABASE_URL=postgresql://user:pass@localhost:5432/cheese
```

---

## Running the Migration

```bash
# Build first
npm run build

# Apply migration
npm run migration:run
```

The migration handles both **fresh installs** (creates the full table) and
**existing databases** (nullifies email, adds walletAddress column, clears
`internal-*` placeholder values).

---

## Multi-Instance / Redis Note

`ChallengeStore` is an in-memory singleton. It works fine for single-instance
deployments. For horizontal scaling, replace it with a Redis implementation:

```typescript
// redis-challenge.store.ts — drop-in replacement
@Injectable()
export class RedisChallengeStore extends ChallengeStore {
  constructor(private readonly redis: Redis) { super(); }

  async set(wallet: string, challenge: string) {
    await this.redis.set(`challenge:${wallet}`, challenge, 'EX', 300);
  }

  async consume(wallet: string, challenge: string): Promise<boolean> {
    const stored = await this.redis.get(`challenge:${wallet}`);
    if (!stored || stored !== challenge) return false;
    await this.redis.del(`challenge:${wallet}`);
    return true;
  }
}
```
