import { AppDataSource } from '../typeorm.config';

async function verifyMigrations() {
  try {
    console.log('Initializing database connection...');
    await AppDataSource.initialize();

    console.log('\n✓ Database connection successful');
    console.log(`  Database: ${AppDataSource.options.database}`);

    // Check migrations table
    const migrations = await AppDataSource.query(
      `SELECT * FROM "typeorm_metadata" WHERE "type" = 'migration' ORDER BY "timestamp"`
    );

    console.log('\n✓ Migrations table exists');
    console.log(`  Applied migrations: ${migrations.length}`);

    if (migrations.length > 0) {
      console.log('\n  Migration history:');
      migrations.forEach((m: any) => {
        console.log(`    - ${m.name} (${new Date(m.timestamp).toISOString()})`);
      });
    }

    // Check tables using PostgreSQL information_schema
    const tables = await AppDataSource.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name`
    );

    console.log('\n✓ Database tables:');
    tables.forEach((t: any) => {
      console.log(`    - ${t.table_name}`);
    });

    // Check users table structure
    const usersInfo = await AppDataSource.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);
    console.log('\n✓ Users table structure:');
    usersInfo.forEach((col: any) => {
      const nullable = col.is_nullable === 'YES' ? 'nullable' : 'not null';
      console.log(`    - ${col.column_name} (${col.data_type}, ${nullable})`);
    });

    // Check groups table structure
    const groupsInfo = await AppDataSource.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'groups'
      ORDER BY ordinal_position
    `);
    console.log('\n✓ Groups table structure:');
    groupsInfo.forEach((col: any) => {
      const nullable = col.is_nullable === 'YES' ? 'nullable' : 'not null';
      console.log(`    - ${col.column_name} (${col.data_type}, ${nullable})`);
    });

    // Check memberships table structure
    const membershipsInfo = await AppDataSource.query(`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_name = 'memberships'
      ORDER BY ordinal_position
    `);
    console.log('\n✓ Memberships table structure:');
    membershipsInfo.forEach((col: any) => {
      const nullable = col.is_nullable === 'YES' ? 'nullable' : 'not null';
      console.log(`    - ${col.column_name} (${col.data_type}, ${nullable})`);
    });

    // Check indexes using PostgreSQL
    const indexes = await AppDataSource.query(`
      SELECT indexname FROM pg_indexes WHERE schemaname = 'public' ORDER BY indexname
    `);
    console.log('\n✓ Database indexes:');
    indexes.forEach((idx: any) => {
      console.log(`    - ${idx.indexname}`);
    });

    console.log('\n✅ All migration checks passed!\n');

    await AppDataSource.destroy();
  } catch (error) {
    console.error('\n❌ Verification failed:', error);
    process.exit(1);
  }
}

verifyMigrations();
