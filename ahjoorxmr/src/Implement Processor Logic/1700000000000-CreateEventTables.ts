import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateEventTables1700000000000 implements MigrationInterface {
  name = 'CreateEventTables1700000000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── on_chain_events ──────────────────────────────────────────────────────
    await queryRunner.createTable(
      new Table({
        name: 'on_chain_events',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'event_name', type: 'varchar' },
          { name: 'transaction_hash', type: 'varchar' },
          { name: 'block_number', type: 'bigint' },
          { name: 'contract_address', type: 'varchar' },
          { name: 'chain_id', type: 'int' },
          { name: 'processed_at', type: 'timestamp', isNullable: true },
          { name: 'created_at', type: 'timestamp', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'on_chain_events',
      new TableIndex({
        name: 'UQ_on_chain_events_tx_chain',
        columnNames: ['transaction_hash', 'chain_id'],
        isUnique: true,
      }),
    );

    // ── approval_events ───────────────────────────────────────────────────────
    await queryRunner.createTable(
      new Table({
        name: 'approval_events',
        columns: [
          {
            name: 'id',
            type: 'uuid',
            isPrimary: true,
            generationStrategy: 'uuid',
            default: 'uuid_generate_v4()',
          },
          { name: 'owner_address', type: 'varchar' },
          { name: 'spender_address', type: 'varchar' },
          { name: 'amount', type: 'numeric', precision: 78, scale: 0 },
          { name: 'transaction_hash', type: 'varchar' },
          { name: 'block_number', type: 'bigint' },
          { name: 'contract_address', type: 'varchar' },
          { name: 'chain_id', type: 'int' },
          { name: 'created_at', type: 'timestamp', default: 'now()' },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      'approval_events',
      new TableIndex({
        name: 'IDX_approval_events_tx_hash',
        columnNames: ['transaction_hash'],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('approval_events', true);
    await queryRunner.dropTable('on_chain_events', true);
  }
}
