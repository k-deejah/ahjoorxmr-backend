# Database Seeding & Fixtures

This directory contains the database seeding infrastructure for populating the database with sample data for development and testing.

## Overview

The seeding system provides:
- **Idempotent seeding**: Can run multiple times safely without duplicating data
- **Realistic test data**: Generated data includes proper relationships between entities
- **Factory pattern**: Reusable factory functions for generating test data
- **Environment support**: Works in both development and test environments

## Structure

```
src/database/
├── seeds/
│   ├── seed.service.ts      # Main seeding service
│   ├── seed.module.ts        # NestJS module configuration
│   └── README.md             # This file
└── factories/
    ├── user.factory.ts       # User entity factory
    ├── group.factory.ts      # Group entity factory
    ├── membership.factory.ts # Membership entity factory
    └── contribution.factory.ts # Contribution entity factory
```

## Usage

### Seed the Database

Populates the database with sample data. This command is idempotent - it checks for existing data before seeding.

```bash
npm run seed
```

This creates:
- 10 users (some with 2FA enabled)
- 5 groups with various statuses (PENDING, ACTIVE, COMPLETED)
- 3-8 memberships per group
- Contributions for each round based on group status

### Reset and Re-seed

Clears all data and re-seeds the database from scratch.

```bash
npm run seed:reset
```

⚠️ **WARNING**: This command deletes all existing data!

## Generated Data

### Users
- Random 2FA settings (30% have 2FA enabled)
- Backup codes for 2FA-enabled users
- Realistic user profiles

### Groups
- Various group names (Community Savings Circle, Neighborhood Fund, etc.)
- Different tokens (USDC, XLM, USDT, EURC)
- Contribution amounts ranging from 100 to 5000
- Round durations: 1 week, 2 weeks, or 1 month
- Mixed statuses: PENDING (20%), ACTIVE (50%), COMPLETED (30%)
- 4-12 total rounds per group
- 3-5 minimum members

### Memberships
- 3-8 members per group
- Unique payout orders
- Realistic payment status (80% have paid current round)
- Status distribution: ACTIVE (85%), SUSPENDED (10%), REMOVED (5%)

### Contributions
- Created for each round up to the group's current round
- 80% contribution rate per member per round
- Unique transaction hashes
- Timestamps based on round timing

## Factory Functions

Factories are located in `src/database/factories/` and can be used independently for testing:

```typescript
import { UserFactory } from './database/factories/user.factory';

// Create a single user
const user = userFactory.create();

// Create multiple users
const users = userFactory.createMany(10);
```

### Available Factories

- **UserFactory**: Generates users with optional 2FA settings
- **GroupFactory**: Generates groups with realistic ROSCA parameters
- **MembershipFactory**: Generates memberships with proper relationships
- **ContributionFactory**: Generates contributions with unique transaction hashes

## Idempotency

The seeding system is idempotent, meaning you can run `npm run seed` multiple times safely:

1. Checks if users exist in the database
2. If data exists, skips seeding
3. If no data exists, proceeds with seeding

To force re-seeding, use `npm run seed:reset` instead.

## Environment Configuration

The seeding system respects your database configuration from `.env`:

```env
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=postgres
DB_NAME=ahjoorxmr
NODE_ENV=development
```

## Testing Integration

You can use the seeding system in your tests:

```typescript
import { Test } from '@nestjs/testing';
import { SeedModule } from './database/seeds/seed.module';
import { SeedService } from './database/seeds/seed.service';

describe('Integration Tests', () => {
  let seedService: SeedService;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [SeedModule],
    }).compile();

    seedService = module.get<SeedService>(SeedService);
    await seedService.seed();
  });

  afterAll(async () => {
    await seedService.reset();
  });

  // Your tests here
});
```

## Customization

To customize the seeding behavior, modify the factory functions or the `SeedService`:

- **Change data volume**: Adjust counts in `seed.service.ts`
- **Modify data patterns**: Update factory functions in `src/database/factories/`
- **Add new entities**: Create new factories and update `SeedService`

## Best Practices

1. **Run seeds after migrations**: Always run migrations before seeding
2. **Use in development only**: Don't run seeds in production
3. **Reset for clean state**: Use `seed:reset` when you need a fresh start
4. **Customize for tests**: Create test-specific seed configurations if needed
