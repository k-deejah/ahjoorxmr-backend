import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

/**
 * Adds KYC-related columns to the `users` table.
 *
 * Columns added:
 *  - kyc_status     VARCHAR   default 'NONE'
 *  - kyc_reason     TEXT      nullable  (stores approval/rejection note)
 *  - kyc_reviewed_at TIMESTAMPTZ nullable
 *  - kyc_reviewed_by VARCHAR   nullable  (admin user ID)
 */
export class AddKycColumnsToUsers1700000000000 implements MigrationInterface {
  name = 'AddKycColumnsToUsers1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumns('users', [
      new TableColumn({
        name: 'kyc_status',
        type: 'varchar',
        length: '20',
        isNullable: false,
        default: `'NONE'`,
      }),
      new TableColumn({
        name: 'kyc_reason',
        type: 'text',
        isNullable: true,
        default: null,
      }),
      new TableColumn({
        name: 'kyc_reviewed_at',
        type: 'timestamptz',
        isNullable: true,
        default: null,
      }),
      new TableColumn({
        name: 'kyc_reviewed_by',
        type: 'varchar',
        isNullable: true,
        default: null,
      }),
    ]);

    // Index for fast guard lookups
    await queryRunner.query(
      `CREATE INDEX "IDX_users_kyc_status" ON "users" ("kyc_status")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_users_kyc_status"`);
    await queryRunner.dropColumns('users', [
      'kyc_status',
      'kyc_reason',
      'kyc_reviewed_at',
      'kyc_reviewed_by',
    ]);
  }
}
