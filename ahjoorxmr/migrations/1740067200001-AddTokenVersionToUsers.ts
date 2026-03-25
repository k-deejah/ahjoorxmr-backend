import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddTokenVersionToUsers1740067200001 implements MigrationInterface {
    name = 'AddTokenVersionToUsers1740067200001';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
      ALTER TABLE "users" ADD COLUMN "tokenVersion" integer NOT NULL DEFAULT 0
    `);

        await queryRunner.query(`
      CREATE INDEX "IDX_users_tokenVersion" ON "users" ("tokenVersion")
    `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
      DROP INDEX "IDX_users_tokenVersion"
    `);

        await queryRunner.query(`
      ALTER TABLE "users" DROP COLUMN "tokenVersion"
    `);
    }
}
