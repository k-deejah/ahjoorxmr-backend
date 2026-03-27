import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

/**
 * Migration: make walletAddress the primary identifier on the users table.
 *
 * Changes:
 *  - walletAddress column becomes NOT NULL for new rows, nullable for
 *    pre-existing email-only accounts (the ALTER retains nullability so
 *    existing rows are not broken).
 *  - email column becomes nullable (was previously required).
 *  - passwordHash column becomes nullable.
 *  - Adds unique index on walletAddress.
 *  - Drops the internal placeholder default that was `internal-${Date.now()}`.
 *
 * If you are starting fresh (no existing data), you can skip to the
 * CreateUsersTable migration below instead.
 */

export class WalletPrimaryAuth1712345678901 implements MigrationInterface {
  name = 'WalletPrimaryAuth1712345678901';

  // -------------------------------------------------------------------------
  // UP
  // -------------------------------------------------------------------------
  public async up(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('users');

    if (!tableExists) {
      // -----------------------------------------------------------------------
      // Fresh install — create the table with the correct schema from scratch
      // -----------------------------------------------------------------------
      await queryRunner.createTable(
        new Table({
          name: 'users',
          columns: [
            {
              name: 'id',
              type: 'uuid',
              isPrimary: true,
              generationStrategy: 'uuid',
              default: 'uuid_generate_v4()',
            },
            {
              name: 'walletAddress',
              type: 'varchar',
              length: '56',
              isNullable: true,
              isUnique: true,
            },
            {
              name: 'email',
              type: 'varchar',
              length: '255',
              isNullable: true,
              isUnique: true,
            },
            {
              name: 'passwordHash',
              type: 'varchar',
              isNullable: true,
            },
            {
              name: 'username',
              type: 'varchar',
              length: '30',
              isNullable: true,
              isUnique: true,
            },
            {
              name: 'tier',
              type: 'enum',
              enum: ['silver', 'gold', 'black'],
              default: "'silver'",
            },
            {
              name: 'isKycVerified',
              type: 'boolean',
              default: false,
            },
            {
              name: 'isActive',
              type: 'boolean',
              default: true,
            },
            {
              name: 'createdAt',
              type: 'timestamp',
              default: 'now()',
            },
            {
              name: 'updatedAt',
              type: 'timestamp',
              default: 'now()',
            },
          ],
        }),
        true,
      );

      await queryRunner.createIndex(
        'users',
        new TableIndex({ name: 'IDX_users_walletAddress', columnNames: ['walletAddress'] }),
      );

      await queryRunner.createIndex(
        'users',
        new TableIndex({ name: 'IDX_users_email', columnNames: ['email'] }),
      );
    } else {
      // -----------------------------------------------------------------------
      // Existing table — apply incremental changes
      // -----------------------------------------------------------------------

      // 1. Nullify email (was NOT NULL in legacy schema)
      await queryRunner.query(`
        ALTER TABLE "users"
          ALTER COLUMN "email" DROP NOT NULL
      `);

      // 2. Add walletAddress if it does not exist yet
      const hasWallet = await queryRunner.hasColumn('users', 'walletAddress');
      if (!hasWallet) {
        await queryRunner.query(`
          ALTER TABLE "users"
            ADD COLUMN "walletAddress" VARCHAR(56) UNIQUE
        `);
      }

      // 3. Nullify passwordHash
      const hasPwHash = await queryRunner.hasColumn('users', 'passwordHash');
      if (hasPwHash) {
        await queryRunner.query(`
          ALTER TABLE "users"
            ALTER COLUMN "passwordHash" DROP NOT NULL
        `);
      }

      // 4. Remove placeholder wallet values that look like `internal-*`
      await queryRunner.query(`
        UPDATE "users"
           SET "walletAddress" = NULL
         WHERE "walletAddress" LIKE 'internal-%'
      `);

      // 5. Ensure unique index exists
      const hasIdx = await queryRunner.query(`
        SELECT 1
          FROM pg_indexes
         WHERE tablename = 'users'
           AND indexname = 'IDX_users_walletAddress'
      `);
      if (!hasIdx.length) {
        await queryRunner.createIndex(
          'users',
          new TableIndex({
            name: 'IDX_users_walletAddress',
            columnNames: ['walletAddress'],
          }),
        );
      }
    }
  }

  // -------------------------------------------------------------------------
  // DOWN
  // -------------------------------------------------------------------------
  public async down(queryRunner: QueryRunner): Promise<void> {
    const tableExists = await queryRunner.hasTable('users');
    if (!tableExists) return;

    // Restore email to NOT NULL (set a fallback value first to avoid constraint error)
    await queryRunner.query(`
      UPDATE "users" SET "email" = CONCAT('unknown-', id, '@placeholder.cheese')
      WHERE "email" IS NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "users" ALTER COLUMN "email" SET NOT NULL
    `);

    // Drop the walletAddress index
    const idxExists = await queryRunner.query(`
      SELECT 1 FROM pg_indexes
       WHERE tablename = 'users'
         AND indexname = 'IDX_users_walletAddress'
    `);
    if (idxExists.length) {
      await queryRunner.dropIndex('users', 'IDX_users_walletAddress');
    }
  }
}
