// Fix messages full-text search
require('dotenv').config();
const postgres = require('postgres');

async function fix() {
  const sql = postgres(process.env.DATABASE_URL, { max: 1 });
  
  console.log('🔄 Fixing messages full-text search...\n');
  
  try {
    // Content is stored as TEXT (JSON string), not JSONB
    // We need to parse it as JSON first
    // Skip image data (base64) and very long content
    
    console.log('[1/4] Updating messages search vectors...');
    await sql.unsafe(`
      UPDATE public.messages 
      SET search_vector = to_tsvector('english', 
        LEFT(
          CASE 
            -- Skip base64 image data
            WHEN content LIKE '%data:image%' THEN ''
            WHEN content LIKE '%blob.core.windows.net%' THEN ''
            -- Simple string content (most common)
            WHEN content NOT LIKE '[%' AND content NOT LIKE '{%' THEN 
              TRIM(BOTH '"' FROM content)
            -- Array content (multimodal) - extract text parts only
            WHEN content LIKE '[%' THEN 
              COALESCE((
                SELECT string_agg(
                  TRIM(BOTH '"' FROM (elem->>'text')), ' '
                )
                FROM jsonb_array_elements(content::jsonb) AS elem
                WHERE elem->>'type' = 'text' 
                  AND elem->>'text' IS NOT NULL
                  AND elem->>'text' NOT LIKE '%data:image%'
              ), '')
            -- Object content
            WHEN content LIKE '{%' THEN 
              COALESCE(content::jsonb->>'text', TRIM(BOTH '"' FROM content))
            ELSE 
              TRIM(BOTH '"' FROM content)
          END
        , 100000)  -- Limit to 100KB
      )
      WHERE role IN ('user', 'assistant') 
        AND (search_vector IS NULL OR search_vector = '')
        AND LENGTH(content) < 500000  -- Skip very large content
    `);
    console.log('   ✅ OK\n');
    
    // Create GIN index
    console.log('[2/4] Creating GIN index...');
    await sql.unsafe(`CREATE INDEX IF NOT EXISTS idx_messages_search_vector ON public.messages USING GIN(search_vector)`);
    console.log('   ✅ OK\n');
    
    // Create simple trigger function (content is TEXT, not JSONB)
    console.log('[3/4] Creating trigger function...');
    await sql.unsafe(`
      CREATE OR REPLACE FUNCTION messages_search_vector_update() RETURNS trigger AS $func$
      BEGIN
        IF NEW.role IN ('user', 'assistant') THEN
          NEW.search_vector := to_tsvector('english', 
            CASE 
              WHEN NEW.content NOT LIKE '[%' AND NEW.content NOT LIKE '{%' THEN 
                TRIM(BOTH '"' FROM NEW.content)
              WHEN NEW.content LIKE '[%' THEN 
                COALESCE((
                  SELECT string_agg(TRIM(BOTH '"' FROM (elem->>'text')), ' ')
                  FROM jsonb_array_elements(NEW.content::jsonb) AS elem
                  WHERE elem->>'type' = 'text'
                ), '')
              WHEN NEW.content LIKE '{%' THEN 
                COALESCE(NEW.content::jsonb->>'text', TRIM(BOTH '"' FROM NEW.content))
              ELSE 
                TRIM(BOTH '"' FROM NEW.content)
            END
          );
        END IF;
        RETURN NEW;
      END;
      $func$ LANGUAGE plpgsql
    `);
    console.log('   ✅ OK\n');
    
    // Create trigger
    console.log('[4/4] Creating trigger...');
    await sql.unsafe(`DROP TRIGGER IF EXISTS messages_search_vector_trigger ON public.messages`);
    await sql.unsafe(`
      CREATE TRIGGER messages_search_vector_trigger
      BEFORE INSERT OR UPDATE OF content ON public.messages
      FOR EACH ROW
      EXECUTE FUNCTION messages_search_vector_update()
    `);
    console.log('   ✅ OK\n');
    
    console.log('✅ Full-text search setup complete!');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await sql.end();
  }
}

fix();
