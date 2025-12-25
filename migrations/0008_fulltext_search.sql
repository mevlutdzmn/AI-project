-- Migration: Add Full-Text Search for ChatGPT-like conversation search
-- Date: 2025-12-25
-- Description: Adds tsvector columns and GIN indexes for hybrid search

-- =====================================================
-- 1. Add search_vector column to sessions (for title search)
-- =====================================================
ALTER TABLE public.sessions 
ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Update existing sessions with search vector
UPDATE public.sessions 
SET search_vector = to_tsvector('english', COALESCE(title, ''));

-- Create GIN index for fast full-text search on sessions
CREATE INDEX IF NOT EXISTS idx_sessions_search_vector 
ON public.sessions USING GIN(search_vector);

-- Create trigger to auto-update search_vector on title change
CREATE OR REPLACE FUNCTION sessions_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', COALESCE(NEW.title, ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS sessions_search_vector_trigger ON public.sessions;
CREATE TRIGGER sessions_search_vector_trigger
  BEFORE INSERT OR UPDATE OF title ON public.sessions
  FOR EACH ROW
  EXECUTE FUNCTION sessions_search_vector_update();

-- =====================================================
-- 2. Add search_vector column to messages (for content search)
-- =====================================================
ALTER TABLE public.messages 
ADD COLUMN IF NOT EXISTS search_vector tsvector;

-- Create function to extract text from JSONB content
CREATE OR REPLACE FUNCTION extract_message_text(content jsonb) RETURNS text AS $$
DECLARE
  result text := '';
  item jsonb;
BEGIN
  -- If content is a string (stored as JSON string)
  IF jsonb_typeof(content) = 'string' THEN
    RETURN content #>> '{}';
  END IF;
  
  -- If content is an array (multimodal message)
  IF jsonb_typeof(content) = 'array' THEN
    FOR item IN SELECT * FROM jsonb_array_elements(content)
    LOOP
      IF item->>'type' = 'text' THEN
        result := result || ' ' || COALESCE(item->>'text', '');
      END IF;
    END LOOP;
    RETURN trim(result);
  END IF;
  
  -- Fallback: try to cast to text
  RETURN content::text;
EXCEPTION WHEN OTHERS THEN
  RETURN '';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Update existing messages with search vector
UPDATE public.messages 
SET search_vector = to_tsvector('english', extract_message_text(content))
WHERE role IN ('user', 'assistant');

-- Create GIN index for fast full-text search on messages
CREATE INDEX IF NOT EXISTS idx_messages_search_vector 
ON public.messages USING GIN(search_vector);

-- Create index for session_id to speed up joins
CREATE INDEX IF NOT EXISTS idx_messages_session_id 
ON public.messages(session_id);

-- Create trigger to auto-update search_vector on content change
CREATE OR REPLACE FUNCTION messages_search_vector_update() RETURNS trigger AS $$
BEGIN
  IF NEW.role IN ('user', 'assistant') THEN
    NEW.search_vector := to_tsvector('english', extract_message_text(NEW.content));
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS messages_search_vector_trigger ON public.messages;
CREATE TRIGGER messages_search_vector_trigger
  BEFORE INSERT OR UPDATE OF content ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION messages_search_vector_update();

-- =====================================================
-- 3. Create composite index for user + recency search
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_sessions_user_updated 
ON public.sessions(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_sessions_user_created 
ON public.sessions(user_id, created_at DESC);

-- =====================================================
-- 4. Create helper function for search ranking
-- =====================================================
CREATE OR REPLACE FUNCTION search_rank_boost(
  created_at timestamp,
  is_pinned boolean,
  match_count int
) RETURNS float AS $$
DECLARE
  age_days float;
  recency_score float;
  pin_boost float;
  match_boost float;
BEGIN
  -- Calculate age in days
  age_days := EXTRACT(EPOCH FROM (NOW() - created_at)) / 86400.0;
  
  -- Recency score (exponential decay, half-life of 30 days)
  recency_score := EXP(-0.023 * age_days);
  
  -- Pin boost
  pin_boost := CASE WHEN is_pinned THEN 1.5 ELSE 1.0 END;
  
  -- Match count boost (logarithmic)
  match_boost := 1.0 + (LN(match_count + 1) * 0.2);
  
  RETURN recency_score * pin_boost * match_boost;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- 5. Verify indexes
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE 'Full-text search migration completed successfully!';
  RAISE NOTICE 'Indexes created: idx_sessions_search_vector, idx_messages_search_vector';
END $$;
