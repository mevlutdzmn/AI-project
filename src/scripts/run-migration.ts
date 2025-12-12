import 'dotenv/config';
import * as fs from 'fs';
import * as path from 'path';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';

async function runMigration() {
  try {
    console.log('Running database migration...');

    const dbUrl = process.env.DATABASE_URL as string;
    if (!dbUrl) {
      throw new Error('DATABASE_URL is not set');
    }

    const sqlClient = postgres(dbUrl, { prepare: false });
    const db = drizzle(sqlClient);

    const fallback = path.join(
      process.cwd(),
      '..',
      'goo_ai_back-main',
      'migrations',
      'FINAL_MIGRATION.sql',
    );
    const migrationPath =
      process.env.MIGRATION_PATH || process.argv[2] || fallback;

    if (!fs.existsSync(migrationPath)) {
      throw new Error(`Migration file not found at: ${migrationPath}`);
    }

    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    const statements = migrationSQL
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0 && !s.startsWith('--'));

    for (const statement of statements) {
      const preview = statement.replace(/\s+/g, ' ').slice(0, 80);
      console.log('Executing:', preview + (statement.length > 80 ? '...' : ''));
      await db.execute(statement as any);
    }

    console.log('Migration completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

runMigration();
