// Fix conflicting RLS policies
require('dotenv').config();
const postgres = require('postgres');

async function fixPolicies() {
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });

  const policiesToDrop = [
    { table: 'shared_chats', policy: 'Block anon shared_chats' },
    { table: 'shared_messages', policy: 'Block anon shared_messages' }
  ];

  console.log('🔄 Fixing conflicting RLS policies...\n');

  for (const { table, policy } of policiesToDrop) {
    try {
      await sql.unsafe(`DROP POLICY IF EXISTS "${policy}" ON public.${table}`);
      console.log(`✅ Dropped: ${policy}`);
    } catch (e) {
      console.log(`❌ ${policy}: ${e.message}`);
    }
  }

  await sql.end();
  console.log('\n✅ Done!');
}

fixPolicies();
