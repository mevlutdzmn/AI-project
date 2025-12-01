const postgres = require('postgres');

(async () => {
  const sql = postgres('postgresql://postgres.tbwqaradnfivziwzwcle:FqNeD7SIzasxBB4p@aws-1-eu-north-1.pooler.supabase.com:6543/postgres');
  
  const result1 = await sql`DELETE FROM users WHERE email = 'mdizman124@gmail.com'`;
  const result2 = await sql`DELETE FROM pending_users WHERE email = 'mdizman124@gmail.com'`;
  
  console.log('Cleaned from users:', result1.count);
  console.log('Cleaned from pending_users:', result2.count);
  
  await sql.end();
})();
