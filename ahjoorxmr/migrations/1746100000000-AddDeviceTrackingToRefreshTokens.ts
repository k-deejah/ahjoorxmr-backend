import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddDeviceTrackingToRefreshTokens1746100000000
  implements MigrationInterface
{
  name = 'AddDeviceTrackingToRefreshTokens1746100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // absoluteExpiresAt: session lifetime cap (default to expiresAt for existing rows)
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "absoluteExpiresAt" TIMESTAMP`,
    );
    await queryRunner.query(
      `UPDATE "refresh_tokens" SET "absoluteExpiresAt" = "expiresAt" WHERE "absoluteExpiresAt" IS NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ALTER COLUMN "absoluteExpiresAt" SET NOT NULL`,
    );

    // Device tracking fields
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "deviceId" character varying(255) DEFAULT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "deviceName" character varying(255) DEFAULT NULL`,
    );
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "ipAddress" character varying(45) DEFAULT NULL`,
    );

    // lastUsedAt (UpdateDateColumn equivalent)
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD COLUMN IF NOT EXISTS "lastUsedAt" TIMESTAMP NOT NULL DEFAULT now()`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "lastUsedAt"`);
    await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "ipAddress"`);
    await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "deviceName"`);
    await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "deviceId"`);
    await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "absoluteExpiresAt"`);
  }
}
