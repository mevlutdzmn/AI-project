const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

const pool = new Pool({ 
  connectionString: DATABASE_URL
});

async function main() {
  // First get table columns
  const cols = await pool.query(
    "SELECT column_name FROM information_schema.columns WHERE table_name = 'users'"
  );
  console.log('Users table columns:', cols.rows.map(r => r.column_name));
  
  // Check user status
  const result = await pool.query(
    'SELECT * FROM users WHERE email = $1',
    ['mevlutdzman@gmail.com']
  );
  
  console.log('Current user status:', result.rows);
  
  if (result.rows.length > 0) {
    // Activate user and extend subscription
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + 1); // 1 year from now
    
    await pool.query(
      'UPDATE users SET active = true, subscription_expires_at = $1 WHERE email = $2',
      [futureDate.toISOString(), 'mevlutdzman@gmail.com']
    );
    
    console.log('✅ User activated and subscription extended to:', futureDate.toISOString());
  }
  
  await pool.end();
}

main().catch(console.error);
