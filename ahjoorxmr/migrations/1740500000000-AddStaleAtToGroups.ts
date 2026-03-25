import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddStaleAtToGroups1740500000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'groups',
      new TableColumn({
        name: 'staleAt',
        type: 'timestamp',
        isNullable: true,
        default: null,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('groups', 'staleAt');
  }
}
