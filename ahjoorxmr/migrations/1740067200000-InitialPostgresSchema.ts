import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialPostgresSchema1740067200000 implements MigrationInterface {
    name = 'InitialPostgresSchema1740067200000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        // Create membership_status enum
        await queryRunner.query(`
      CREATE TYPE "membership_status_enum" AS ENUM('ACTIVE', 'SUSPENDED', 'REMOVED')
    `);

        // Create group_status enum
        await queryRunner.query(`
      CREATE TYPE "group_status_enum" AS ENUM('PENDING', 'ACTIVE', 'COMPLETED')
    `);

        // Create users table
        await queryRunner.query(`
      CREATE TABLE "users" (
        "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "walletAddress" varchar(255) NOT NULL UNIQUE,
        "email" varchar(255) UNIQUE,
        "username" varchar(255),
        "password" varchar(255),
        "role" varchar(20) NOT NULL DEFAULT 'user',
        "refreshTokenHash" varchar(255),
        "twoFactorSecret" varchar(255),
        "twoFactorEnabled" boolean NOT NULL DEFAULT false,
        "backupCodes" text[],
        "firstName" varchar(255),
        "lastName" varchar(255),
        "avatarUrl" varchar(500),
        "bio" text,
        "preferences" jsonb,
        "isActive" boolean NOT NULL DEFAULT true,
        "isVerified" boolean NOT NULL DEFAULT false,
        "verifiedAt" TIMESTAMP,
        "lastLoginAt" TIMESTAMP,
        "bannedAt" TIMESTAMP,
        "banReason" text,
        "registrationIp" varchar(100),
        "lastLoginIp" varchar(100),
        "metadata" jsonb
      )
    `);

        // Create indexes for users
        await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_users_email" ON "users" ("email") WHERE "email" IS NOT NULL
    `);
        await queryRunner.query(`
      CREATE UNIQUE INDEX "IDX_users_walletAddress" ON "users" ("walletAddress")
    `);
        await queryRunner.query(`
      CREATE INDEX "IDX_users_createdAt" ON "users" ("createdAt")
    `);

        // Create groups table
        await queryRunner.query(`
      CREATE TABLE "groups" (
        "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "name" varchar(255) NOT NULL,
        "contractAddress" varchar(255),
        "adminWallet" varchar(255) NOT NULL,
        "contributionAmount" varchar(100) NOT NULL,
        "token" varchar(255) NOT NULL,
        "roundDuration" integer NOT NULL,
        "status" "group_status_enum" NOT NULL DEFAULT 'PENDING',
        "currentRound" integer NOT NULL DEFAULT 0,
        "totalRounds" integer NOT NULL,
        "minMembers" integer NOT NULL,
        "deletedAt" TIMESTAMP
      )
    `);

        // Create indexes for groups
        await queryRunner.query(`
      CREATE INDEX "IDX_groups_deletedAt" ON "groups" ("deletedAt") WHERE "deletedAt" IS NOT NULL
    `);

        // Create memberships table
        await queryRunner.query(`
      CREATE TABLE "memberships" (
        "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "groupId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "walletAddress" varchar(255) NOT NULL,
        "payoutOrder" integer NOT NULL,
        "hasReceivedPayout" boolean NOT NULL DEFAULT false,
        "hasPaidCurrentRound" boolean NOT NULL DEFAULT false,
        "contributionsMade" integer NOT NULL DEFAULT 0,
        "transactionHash" varchar(255),
        "status" "membership_status_enum" NOT NULL DEFAULT 'ACTIVE',
        CONSTRAINT "FK_memberships_groupId" FOREIGN KEY ("groupId") REFERENCES "groups" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "FK_memberships_userId" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "UQ_memberships_groupId_userId" UNIQUE ("groupId", "userId")
      )
    `);

        // Create indexes for memberships
        await queryRunner.query(`
      CREATE INDEX "IDX_memberships_groupId" ON "memberships" ("groupId")
    `);
        await queryRunner.query(`
      CREATE INDEX "IDX_memberships_userId" ON "memberships" ("userId")
    `);

        // Create contributions table
        await queryRunner.query(`
      CREATE TABLE "contributions" (
        "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
        "groupId" uuid NOT NULL,
        "userId" uuid NOT NULL,
        "walletAddress" varchar(255) NOT NULL,
        "roundNumber" integer NOT NULL,
        "amount" varchar(255) NOT NULL,
        "transactionHash" varchar(255) NOT NULL UNIQUE,
        "timestamp" TIMESTAMP NOT NULL,
        "createdAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "FK_contributions_groupId" FOREIGN KEY ("groupId") REFERENCES "groups" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION,
        CONSTRAINT "FK_contributions_userId" FOREIGN KEY ("userId") REFERENCES "users" ("id") ON DELETE NO ACTION ON UPDATE NO ACTION
      )
    `);

        // Create indexes for contributions
        await queryRunner.query(`
      CREATE INDEX "IDX_contributions_groupId" ON "contributions" ("groupId")
    `);
        await queryRunner.query(`
      CREATE INDEX "IDX_contributions_userId" ON "contributions" ("userId")
    `);
        await queryRunner.query(`
      CREATE INDEX "IDX_contributions_transactionHash" ON "contributions" ("transactionHash")
    `);

        // Create audit_logs table
        await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id" uuid PRIMARY KEY NOT NULL DEFAULT gen_random_uuid(),
        "userId" varchar(255),
        "action" varchar(255) NOT NULL,
        "resource" varchar(255) NOT NULL,
        "metadata" jsonb,
        "timestamp" TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "ipAddress" varchar(255),
        "userAgent" text,
        "requestPayload" jsonb
      )
    `);

        // Create indexes for audit_logs
        await queryRunner.query(`
      CREATE INDEX "IDX_audit_logs_userId" ON "audit_logs" ("userId")
    `);
        await queryRunner.query(`
      CREATE INDEX "IDX_audit_logs_action" ON "audit_logs" ("action")
    `);
        await queryRunner.query(`
      CREATE INDEX "IDX_audit_logs_resource" ON "audit_logs" ("resource")
    `);
        await queryRunner.query(`
      CREATE INDEX "IDX_audit_logs_createdAt" ON "audit_logs" ("timestamp")
    `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Drop tables in reverse order of creation
        await queryRunner.query(`DROP TABLE IF EXISTS "audit_logs"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "contributions"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "memberships"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "groups"`);
        await queryRunner.query(`DROP TABLE IF EXISTS "users"`);

        // Drop enums
        await queryRunner.query(`DROP TYPE IF EXISTS "group_status_enum"`);
        await queryRunner.query(`DROP TYPE IF EXISTS "membership_status_enum"`);
    }
}
