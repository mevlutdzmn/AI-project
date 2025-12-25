// Run full-text search migration
require('dotenv').config();
const postgres = require('postgres');

async function runMigration() {
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  
  console.log('🔄 Running full-text search migration...\n');
  
  try {
    // 1. Add search_vector to sessions
    console.log('[1/10] Adding search_vector to sessions...');
    await sql`ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS search_vector tsvector`;
    console.log('   ✅ OK\n');
    
    // 2. Update existing sessions
    console.log('[2/10] Updating existing sessions...');
    await sql`UPDATE public.sessions SET search_vector = to_tsvector('english', COALESCE(title, '')) WHERE search_vector IS NULL`;
    console.log('   ✅ OK\n');
    
    // 3. Create GIN index on sessions
    console.log('[3/10] Creating GIN index on sessions...');
    await sql`CREATE INDEX IF NOT EXISTS idx_sessions_search_vector ON public.sessions USING GIN(search_vector)`;
    console.log('   ✅ OK\n');
    
    // 4. Create trigger function for sessions
    console.log('[4/10] Creating trigger function for sessions...');
    await sql`
      CREATE OR REPLACE FUNCTION sessions_search_vector_update() RETURNS trigger AS $$
      BEGIN
        NEW.search_vector := to_tsvector('english', COALESCE(NEW.title, ''));
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `;
    console.log('   ✅ OK\n');
    
    // 5. Create trigger for sessions
    console.log('[5/10] Creating trigger for sessions...');
    await sql`DROP TRIGGER IF EXISTS sessions_search_vector_trigger ON public.sessions`;
    await sql`
      CREATE TRIGGER sessions_search_vector_trigger
      BEFORE INSERT OR UPDATE OF title ON public.sessions
      FOR EACH ROW
      EXECUTE FUNCTION sessions_search_vector_update()
    `;
    console.log('   ✅ OK\n');
    
    // 6. Add search_vector to messages
    console.log('[6/10] Adding search_vector to messages...');
    await sql`ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS search_vector tsvector`;
    console.log('   ✅ OK\n');
    
    // 7. Create text extraction function
    console.log('[7/10] Creating text extraction function...');
    await sql`
      CREATE OR REPLACE FUNCTION extract_message_text(content jsonb) RETURNS text AS $$
      DECLARE
        result text := '';
        item jsonb;
      BEGIN
        IF jsonb_typeof(content) = 'string' THEN
          RETURN content #>> '{}';
        END IF;
        
        IF jsonb_typeof(content) = 'array' THEN
          FOR item IN SELECT * FROM jsonb_array_elements(content)
          LOOP
            IF item->>'type' = 'text' THEN
              result := result || ' ' || COALESCE(item->>'text', '');
            END IF;
          END LOOP;
          RETURN trim(result);
        END IF;
        
        RETURN content::text;
      EXCEPTION WHEN OTHERS THEN
        RETURN '';
      END;
      $$ LANGUAGE plpgsql IMMUTABLE
    `;
    console.log('   ✅ OK\n');
    
    // 8. Update existing messages
    console.log('[8/10] Updating existing messages (this may take a while)...');
    await sql`
      UPDATE public.messages 
      SET search_vector = to_tsvector('english', extract_message_text(content))
      WHERE role IN ('user', 'assistant') AND search_vector IS NULL
    `;
    console.log('   ✅ OK\n');
    
    // 9. Create GIN index on messages
    console.log('[9/10] Creating GIN index on messages...');
    await sql`CREATE INDEX IF NOT EXISTS idx_messages_search_vector ON public.messages USING GIN(search_vector)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_messages_session_id ON public.messages(session_id)`;
    console.log('   ✅ OK\n');
    
    // 10. Create trigger for messages
    console.log('[10/10] Creating trigger for messages...');
    await sql`DROP TRIGGER IF EXISTS messages_search_vector_trigger ON public.messages`;
    await sql`
      CREATE OR REPLACE FUNCTION messages_search_vector_update() RETURNS trigger AS $$
      BEGIN
        IF NEW.role IN ('user', 'assistant') THEN
          NEW.search_vector := to_tsvector('english', extract_message_text(NEW.content));
        END IF;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `;
    await sql`
      CREATE TRIGGER messages_search_vector_trigger
      BEFORE INSERT OR UPDATE OF content ON public.messages
      FOR EACH ROW
      EXECUTE FUNCTION messages_search_vector_update()
    `;
    console.log('   ✅ OK\n');
    
    console.log('✅ Full-text search migration completed successfully!');
    
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
  } finally {
    await sql.end();
  }
}

runMigration();
