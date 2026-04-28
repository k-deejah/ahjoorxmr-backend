import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from 'typeorm';

export class CreateGroupTemplatesTable1748100000000 implements MigrationInterface {
  name = 'CreateGroupTemplatesTable1748100000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'group_templates',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          {
            name: 'name',
            type: 'varchar',
            length: '255',
            isNullable: false,
          },
          {
            name: 'description',
            type: 'varchar',
            length: '1000',
            isNullable: true,
            default: null,
          },
          {
            name: 'isPublic',
            type: 'boolean',
            default: false,
          },
          {
            name: 'config',
            type: 'jsonb',
            isNullable: false,
          },
          {
            name: 'ownerId',
            type: 'uuid',
            isNullable: false,
          },
          {
            name: 'usageCount',
            type: 'int',
            default: 0,
          },
          {
            name: 'createdAt',
            type: 'timestamp with time zone',
            default: 'now()',
          },
          {
            name: 'updatedAt',
            type: 'timestamp with time zone',
            default: 'now()',
          },
          {
            name: 'deletedAt',
            type: 'timestamp with time zone',
            isNullable: true,
          },
        ],
      }),
      true,
    );

    // Create index on ownerId for fast lookup of user's templates
    await queryRunner.createIndex(
      'group_templates',
      new TableIndex({
        name: 'idx_group_templates_owner_id',
        columnNames: ['ownerId'],
      }),
    );

    // Create partial index on isPublic for fast lookup of public templates
    await queryRunner.createIndex(
      'group_templates',
      new TableIndex({
        name: 'idx_group_templates_public',
        columnNames: ['isPublic'],
        where: '"isPublic" = true',
      }),
    );

    // Add foreign key constraint on ownerId
    await queryRunner.createForeignKey(
      'group_templates',
      new TableForeignKey({
        columnNames: ['ownerId'],
        referencedTableName: 'users',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('group_templates', true);
  }
}
