// Run migration script
const { drizzle } = require('drizzle-orm/postgres-js');
const postgres = require('postgres');
const fs = require('fs');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

async function runMigration() {
  const sql = postgres(DATABASE_URL, { max: 1 });
  
  try {
    console.log('🔄 Running migration...');
    
    // Read migration file
    const migrationSQL = fs.readFileSync('./migrations/add-input-type-column.sql', 'utf8');
    
    // Execute migration
    await sql.unsafe(migrationSQL);
    
    console.log('✅ Migration completed successfully!');
    
    // Verify column exists
    const result = await sql`
      SELECT column_name, data_type, column_default 
      FROM information_schema.columns 
      WHERE table_name = 'messages' AND column_name = 'input_type'
    `;
    
    if (result.length > 0) {
      console.log('✅ Column verified:', result[0]);
    } else {
      console.log('⚠️ Column not found - check table name');
    }
    
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
  } finally {
    await sql.end();
  }
}

runMigration();
