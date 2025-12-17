import postgres from 'postgres';
import * as dotenv from 'dotenv';

dotenv.config();

async function addResetPasswordColumns() {
  const connectionString = process.env.DATABASE_URL;

  if (!connectionString) {
    console.error('DATABASE_URL not found in environment variables');
    process.exit(1);
  }

  const sql = postgres(connectionString);

  try {
    // Add reset_token column if it doesn't exist
    await sql`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS reset_token TEXT;
        `;
    console.log('✅ Added reset_token column');

    // Add reset_token_expiry column if it doesn't exist
    await sql`
            ALTER TABLE users 
            ADD COLUMN IF NOT EXISTS reset_token_expiry TIMESTAMP;
        `;
    console.log('✅ Added reset_token_expiry column');

    console.log('✅ Migration completed successfully!');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

addResetPasswordColumns();
