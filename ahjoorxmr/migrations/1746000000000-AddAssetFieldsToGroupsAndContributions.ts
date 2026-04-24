import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAssetFieldsToGroupsAndContributions1746000000000
  implements MigrationInterface
{
  name = 'AddAssetFieldsToGroupsAndContributions1746000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add assetCode and assetIssuer to groups
    await queryRunner.query(
      `ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "assetCode" character varying(12) NOT NULL DEFAULT 'XLM'`,
    );
    await queryRunner.query(
      `ALTER TABLE "groups" ADD COLUMN IF NOT EXISTS "assetIssuer" character varying(56) DEFAULT NULL`,
    );

    // Add assetCode and assetIssuer to contributions for auditability
    await queryRunner.query(
      `ALTER TABLE "contributions" ADD COLUMN IF NOT EXISTS "assetCode" character varying(12) NOT NULL DEFAULT 'XLM'`,
    );
    await queryRunner.query(
      `ALTER TABLE "contributions" ADD COLUMN IF NOT EXISTS "assetIssuer" character varying(56) DEFAULT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "contributions" DROP COLUMN IF EXISTS "assetIssuer"`);
    await queryRunner.query(`ALTER TABLE "contributions" DROP COLUMN IF EXISTS "assetCode"`);
    await queryRunner.query(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "assetIssuer"`);
    await queryRunner.query(`ALTER TABLE "groups" DROP COLUMN IF EXISTS "assetCode"`);
  }
}
