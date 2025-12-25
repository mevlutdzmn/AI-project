// Run RLS Migration
// Usage: node run-rls-migration.js

require('dotenv').config();
const { drizzle } = require('drizzle-orm/postgres-js');
const postgres = require('postgres');
const fs = require('fs');
const path = require('path');

async function runMigration() {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    console.error('❌ DATABASE_URL not found in environment');
    process.exit(1);
  }

  // Use postgres.js client
  const sql = postgres(connectionString, { max: 1 });
  
  try {
    console.log('🔄 Running RLS migration...\n');
    
    // Read the migration file
    const migrationPath = path.join(__dirname, 'migrations', '0007_enable_rls_backend.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
    
    // Split into individual statements (simple split, may need adjustment)
    const statements = migrationSQL
      .split(/;[\r\n]+/)
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));
    
    console.log(`📋 Found ${statements.length} SQL statements to execute\n`);
    
    for (let i = 0; i < statements.length; i++) {
      const stmt = statements[i];
      
      // Skip empty or comment-only statements
      if (!stmt || stmt.startsWith('--')) continue;
      
      try {
        // Show first 60 chars of statement
        const preview = stmt.substring(0, 80).replace(/\n/g, ' ');
        console.log(`[${i + 1}/${statements.length}] ${preview}...`);
        
        await sql.unsafe(stmt);
        console.log('   ✅ OK\n');
      } catch (err) {
        // Check if it's a "policy already exists" error - that's OK
        if (err.message.includes('already exists')) {
          console.log(`   ⚠️  Already exists (skipping)\n`);
        } else {
          console.error(`   ❌ Error: ${err.message}\n`);
        }
      }
    }
    
    console.log('\n✅ RLS Migration completed!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
  } finally {
    await sql.end();
  }
}

runMigration();
