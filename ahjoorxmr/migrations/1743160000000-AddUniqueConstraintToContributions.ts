import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddUniqueConstraintToContributions1743160000000 implements MigrationInterface {
    name = 'AddUniqueConstraintToContributions1743160000000';

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "contributions" 
            ADD CONSTRAINT "UQ_contributions_userId_groupId_roundNumber" 
            UNIQUE ("userId", "groupId", "roundNumber")
        `);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`
            ALTER TABLE "contributions" 
            DROP CONSTRAINT "UQ_contributions_userId_groupId_roundNumber"
        `);
    }
}
