import { MigrationInterface, QueryRunner, TableColumn } from 'typeorm';

export class AddMaxMembersToGroups1740600000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.addColumn(
      'groups',
      new TableColumn({
        name: 'maxMembers',
        type: 'int',
        isNullable: true,
      }),
    );

    // Back-fill existing rows: maxMembers = totalRounds
    await queryRunner.query(
      `UPDATE "groups" SET "maxMembers" = "totalRounds" WHERE "maxMembers" IS NULL`,
    );

    await queryRunner.changeColumn(
      'groups',
      'maxMembers',
      new TableColumn({
        name: 'maxMembers',
        type: 'int',
        isNullable: false,
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumn('groups', 'maxMembers');
  }
}
