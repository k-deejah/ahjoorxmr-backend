import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddFieldEncryptionAndTxStatus1747000000000 implements MigrationInterface {
  name = 'AddFieldEncryptionAndTxStatus1747000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Expand email column to hold ciphertext and add blind index
    await queryRunner.query(`ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "UQ_97672ac88f789774dd47f7c8be3"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_email"`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "email" TYPE varchar(500)`);
    await queryRunner.query(`ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "emailBlindIndex" varchar(64)`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_emailBlindIndex" ON "users" ("emailBlindIndex") WHERE "emailBlindIndex" IS NOT NULL`);

    // Expand twoFactorSecret column for ciphertext
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "twoFactorSecret" TYPE varchar(500)`);

    // Add documentNumber to kyc_documents
    await queryRunner.query(`ALTER TABLE "kyc_documents" ADD COLUMN IF NOT EXISTS "documentNumber" varchar(500)`);

    // Add contribution status enum + column
    await queryRunner.query(`DO $$ BEGIN
      CREATE TYPE "contributions_status_enum" AS ENUM ('PENDING', 'CONFIRMED', 'FAILED');
    EXCEPTION WHEN duplicate_object THEN null; END $$`);
    await queryRunner.query(`ALTER TABLE "contributions" ADD COLUMN IF NOT EXISTS "status" "contributions_status_enum" NOT NULL DEFAULT 'PENDING'`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "contributions" DROP COLUMN IF EXISTS "status"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "contributions_status_enum"`);
    await queryRunner.query(`ALTER TABLE "kyc_documents" DROP COLUMN IF EXISTS "documentNumber"`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "twoFactorSecret" TYPE varchar(255)`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_emailBlindIndex"`);
    await queryRunner.query(`ALTER TABLE "users" DROP COLUMN IF EXISTS "emailBlindIndex"`);
    await queryRunner.query(`ALTER TABLE "users" ALTER COLUMN "email" TYPE varchar(255)`);
    await queryRunner.query(`CREATE UNIQUE INDEX IF NOT EXISTS "IDX_users_email" ON "users" ("email") WHERE email IS NOT NULL`);
  }
}
