# PostgreSQL Migration Guide

This document outlines the migration from SQLite to PostgreSQL for production use.

## Overview

The application has been fully migrated to PostgreSQL with the following improvements:

- **Production-grade database**: PostgreSQL provides better concurrency, reliability, and performance
- **ENUM types**: Status fields now use PostgreSQL ENUM types instead of varchar
- **JSONB support**: Flexible JSON storage with indexing capabilities
- **Array types**: Native array support for backup codes
- **Partial indexes**: Optimized indexes for soft-deleted records
- **Connection pooling**: Configured for production workloads

## Changes Made

### 1. Entity Updates

#### User Entity (`src/users/entities/user.entity.ts`)
- Changed `backupCodes` from `simple-array` to `text[]` (PostgreSQL array type)
- Confirmed `preferences` and `metadata` use `jsonb` type

#### Audit Log Entity (`src/audit/entities/audit-log.entity.ts`)
- Changed `metadata` and `requestPayload` from `json` to `jsonb` for better performance

#### Membership Entity (`src/memberships/entities/membership.entity.ts`)
- Changed `status` from `varchar` to PostgreSQL `ENUM` type
- Uses `MembershipStatus` enum with values: ACTIVE, SUSPENDED, REMOVED

#### Group Entity (`src/groups/entities/group.entity.ts`)
- Changed `status` from `varchar` to PostgreSQL `ENUM` type
- Uses `GroupStatus` enum with values: PENDING, ACTIVE, COMPLETED

### 2. Database Configuration

#### TypeORM Config (`typeorm.config.ts`)
- Already configured for PostgreSQL
- Uses environment variables for connection settings
- Includes connection pooling configuration

#### App Module (`src/app.module.ts`)
- Already configured for PostgreSQL
- Reads database settings from environment variables

### 3. Migrations

#### Old Migrations Removed
- `1740067200000-InitialSchema.ts` (SQLite syntax)
- `1771970077530-Add2FAFields.ts` (SQLite syntax)
- `1771999013033-CreateAuditLogTable.ts` (SQLite syntax)
- `1771999100000-CreateAuditLogSystem.ts` (SQLite syntax)
- `1772000000000-EnhanceUserAndMembershipEntities.ts` (SQLite syntax)
- `1772100000000-AddGroupSoftDelete.ts` (redundant)

#### New Migration
- `1740067200000-InitialPostgresSchema.ts` - Comprehensive PostgreSQL schema with:
  - UUID primary keys
  - ENUM types for status fields
  - JSONB columns for flexible data
  - Text arrays for backup codes
  - Proper indexes and constraints
  - Soft delete support

### 4. Test Updates

All e2e tests migrated from SQLite to PostgreSQL:
- `src/groups/__tests__/activate-group.e2e.spec.ts`
- `src/groups/__tests__/advance-round.e2e.spec.ts`
- `src/memberships/__tests__/record-payout.e2e.spec.ts`

Tests now use environment variables for database configuration:
- `DB_TEST_HOST`
- `DB_TEST_PORT`
- `DB_TEST_USERNAME`
- `DB_TEST_PASSWORD`
- `DB_TEST_NAME`

### 5. Dependencies

- Removed `sqlite3` package from `package.json`
- `pg` package already present for PostgreSQL support

### 6. Scripts

#### Verify Migrations (`scripts/verify-migrations.ts`)
- Updated to use PostgreSQL `information_schema` instead of SQLite `PRAGMA`
- Provides detailed schema verification

## Setup Instructions

### 1. Environment Configuration

Create a `.env` file based on `.env.example`:

```bash
# Production Database
DB_HOST=your-postgres-host
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your-secure-password
DB_NAME=ahjoorxmr
DB_SSL=true  # Enable for production

# Test Database (for running tests)
DB_TEST_HOST=localhost
DB_TEST_PORT=5432
DB_TEST_USERNAME=postgres
DB_TEST_PASSWORD=postgres
DB_TEST_NAME=ahjoorxmr_test
```

### 2. Docker Setup (Development)

Start PostgreSQL and Redis using Docker Compose:

```bash
docker-compose up -d
```

This will start:
- PostgreSQL 16 on port 5432
- Redis 7 on port 6379

### 3. Database Initialization

Install dependencies:
```bash
npm install
```

Run migrations:
```bash
npm run migration:run
```

Verify migrations:
```bash
npm run migration:verify
```

### 4. Running the Application

Development mode:
```bash
npm run start:dev
```

Production mode:
```bash
npm run build
npm run start:prod
```

### 5. Running Tests

Run e2e tests (requires test database):
```bash
npm run test:e2e
```

Run all tests:
```bash
npm run test
```

## Database Schema

### Tables

#### users
- UUID primary key
- Wallet address (unique)
- Email (unique, nullable)
- Authentication fields
- 2FA configuration
- Profile information
- Preferences (JSONB)
- Metadata (JSONB)
- Account status and timestamps

#### groups
- UUID primary key
- Group details (name, token, contribution amount)
- Status (ENUM: PENDING, ACTIVE, COMPLETED)
- Round tracking
- Soft delete support (deletedAt)

#### memberships
- UUID primary key
- Foreign keys to users and groups
- Unique constraint on (groupId, userId)
- Status (ENUM: ACTIVE, SUSPENDED, REMOVED)
- Payout tracking
- Contribution tracking

#### contributions
- UUID primary key
- Foreign keys to users and groups
- Transaction hash (unique)
- Amount and round number
- Timestamps

#### audit_logs
- UUID primary key
- User ID and action tracking
- Resource and metadata (JSONB)
- Request payload (JSONB)
- IP address and user agent
- Timestamps

## Performance Considerations

### Indexes
- Partial indexes on soft-deleted records
- Indexes on foreign keys
- Indexes on frequently queried fields (email, walletAddress, createdAt)

### Connection Pooling
- Min connections: 2
- Max connections: 20
- Idle timeout: 30 seconds
- Connection timeout: 2 seconds

### JSONB Advantages
- Faster queries than JSON
- Supports indexing
- Better compression

## Migration from Existing SQLite Database

If you have an existing SQLite database:

1. **Export data** from SQLite
2. **Transform data** to match PostgreSQL schema
3. **Import data** into PostgreSQL
4. **Verify data integrity**

Example migration script:
```bash
# Export SQLite data
sqlite3 database.sqlite ".dump" > dump.sql

# Transform and import to PostgreSQL
# (Custom script needed for data transformation)
```

## Health Check

The application includes a database health check endpoint:

```bash
GET /health
```

Response includes:
- Database connectivity status
- Response time
- Database type and name
- Connection pool statistics
- Database size and table statistics

## Troubleshooting

### Connection Issues
- Verify PostgreSQL is running: `docker-compose ps`
- Check environment variables in `.env`
- Verify network connectivity to database host

### Migration Errors
- Check migration logs: `npm run migration:run`
- Verify database permissions
- Ensure database exists

### Test Failures
- Ensure test database exists
- Check test database environment variables
- Verify PostgreSQL is running

## Rollback

To rollback migrations:

```bash
npm run migration:revert
```

## References

- [TypeORM PostgreSQL Documentation](https://typeorm.io/data-source-options#postgres-data-source-options)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [Docker PostgreSQL Image](https://hub.docker.com/_/postgres)
