const postgres = require('postgres');

const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('❌ DATABASE_URL environment variable is required');
  process.exit(1);
}

(async () => {
  const sql = postgres(DATABASE_URL);
  
  const result1 = await sql`DELETE FROM users WHERE email = 'mdizman124@gmail.com'`;
  const result2 = await sql`DELETE FROM pending_users WHERE email = 'mdizman124@gmail.com'`;
  
  console.log('Cleaned from users:', result1.count);
  console.log('Cleaned from pending_users:', result2.count);
  
  await sql.end();
})();
