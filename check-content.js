// Check messages content type
require('dotenv').config();
const postgres = require('postgres');

async function check() {
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  
  // Check column type
  const cols = await sql`
    SELECT column_name, data_type, udt_name 
    FROM information_schema.columns 
    WHERE table_name = 'messages' AND column_name = 'content'
  `;
  console.log('Content column type:', cols);
  
  // Check sample data
  const sample = await sql`SELECT content, role FROM messages LIMIT 3`;
  sample.forEach((row, i) => {
    console.log(`\nSample ${i + 1} (${row.role}):`, typeof row.content, JSON.stringify(row.content).substring(0, 150));
  });
  
  await sql.end();
}
check();
