// Run security migration script
const postgres = require('postgres');
const fs = require('fs');
require('dotenv').config();

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL not found in environment');
  process.exit(1);
}

async function runSecurityMigration() {
  const sql = postgres(DATABASE_URL, { max: 1 });
  
  try {
    console.log('🔄 Running security migration...');
    
    // Read migration file
    const migrationSQL = fs.readFileSync('./migrations/0006_security_improvements.sql', 'utf8');
    
    // Execute migration
    await sql.unsafe(migrationSQL);
    
    console.log('✅ Security migration completed successfully!');
    
    // Verify auth_sessions columns
    const authSessionsResult = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'auth_sessions'
      ORDER BY ordinal_position
    `;
    
    console.log('\n📋 auth_sessions table columns:');
    authSessionsResult.forEach(col => {
      console.log(`   - ${col.column_name}: ${col.data_type}`);
    });
    
    // Verify audit_logs table
    const auditLogsResult = await sql`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'audit_logs'
      ORDER BY ordinal_position
    `;
    
    if (auditLogsResult.length > 0) {
      console.log('\n📋 audit_logs table columns:');
      auditLogsResult.forEach(col => {
        console.log(`   - ${col.column_name}: ${col.data_type}`);
      });
    } else {
      console.log('\n⚠️ audit_logs table not found');
    }
    
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    console.error(err);
  } finally {
    await sql.end();
  }
}

runSecurityMigration();
