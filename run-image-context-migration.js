// Run migration to add image_context column
const postgres = require('postgres');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

const sql = postgres(DATABASE_URL);

async function migrate() {
  try {
    console.log('🔄 Adding image_context column to messages table...');
    
    await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS image_context JSONB`;
    
    console.log('✅ Migration completed successfully!');
    console.log('   - Added image_context column to messages table');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

migrate();
