// Run this script to create the shared_messages table
const postgres = require('postgres');
require('dotenv').config();

const sql = postgres(process.env.DATABASE_URL);

async function createTable() {
  try {
    await sql`
      CREATE TABLE IF NOT EXISTS shared_messages (
        id SERIAL PRIMARY KEY,
        share_token VARCHAR(64) NOT NULL UNIQUE,
        content TEXT NOT NULL,
        role VARCHAR(20) DEFAULT 'assistant',
        user_id INTEGER,
        view_count INTEGER DEFAULT 0,
        expires_at TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `;
    console.log('✅ shared_messages table created successfully!');
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await sql.end();
  }
}

createTable();
