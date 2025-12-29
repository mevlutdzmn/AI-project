-- Migration: 0012_fix_image_search_vector.sql
-- Description: Fix tsvector trigger to skip base64 image content
-- Date: 2025-12-29

-- =====================================================
-- Update extract_message_text function to skip base64 images
-- =====================================================
CREATE OR REPLACE FUNCTION extract_message_text(content jsonb) RETURNS text AS $$
DECLARE
  result text := '';
  item jsonb;
  content_text text;
BEGIN
  -- If content is a string (stored as JSON string)
  IF jsonb_typeof(content) = 'string' THEN
    content_text := content #>> '{}';
    
    -- Skip if it's a base64 image (starts with ![)
    IF content_text LIKE '![%' OR content_text LIKE 'data:image%' THEN
      RETURN '';
    END IF;
    
    -- Truncate to max 100KB to avoid tsvector limits
    RETURN LEFT(content_text, 100000);
  END IF;
  
  -- If content is an array (multimodal message)
  IF jsonb_typeof(content) = 'array' THEN
    FOR item IN SELECT * FROM jsonb_array_elements(content)
    LOOP
      IF item->>'type' = 'text' THEN
        content_text := COALESCE(item->>'text', '');
        -- Skip base64 images in text
        IF content_text NOT LIKE '![%' AND content_text NOT LIKE 'data:image%' THEN
          result := result || ' ' || content_text;
        END IF;
      END IF;
    END LOOP;
    -- Truncate to max 100KB
    RETURN LEFT(trim(result), 100000);
  END IF;
  
  -- Fallback: try to cast to text (truncated)
  RETURN LEFT(content::text, 100000);
EXCEPTION WHEN OTHERS THEN
  RETURN '';
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- =====================================================
-- Update the trigger function to handle images safely
-- =====================================================
CREATE OR REPLACE FUNCTION messages_search_vector_update() RETURNS trigger AS $$
DECLARE
  extracted_text text;
BEGIN
  IF NEW.role IN ('user', 'assistant') THEN
    -- Check if content contains base64 image (skip full-text indexing)
    IF NEW.content::text LIKE '%data:image%' OR NEW.content::text LIKE '%![Generated Image]%' THEN
      -- For image messages, just store empty tsvector
      NEW.search_vector := to_tsvector('english', '');
    ELSE
      -- Extract text and create search vector
      extracted_text := extract_message_text(NEW.content);
      -- Only create tsvector if text is not too long
      IF LENGTH(extracted_text) < 500000 THEN
        NEW.search_vector := to_tsvector('english', extracted_text);
      ELSE
        NEW.search_vector := to_tsvector('english', LEFT(extracted_text, 100000));
      END IF;
    END IF;
  END IF;
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- If anything fails, just set empty search vector
  NEW.search_vector := to_tsvector('english', '');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop and recreate trigger
DROP TRIGGER IF EXISTS messages_search_vector_trigger ON public.messages;
CREATE TRIGGER messages_search_vector_trigger
  BEFORE INSERT OR UPDATE OF content ON public.messages
  FOR EACH ROW
  EXECUTE FUNCTION messages_search_vector_update();

-- =====================================================
-- Clean up any existing broken search vectors for images
-- =====================================================
UPDATE public.messages 
SET search_vector = to_tsvector('english', '')
WHERE content::text LIKE '%data:image%' 
   OR content::text LIKE '%![Generated Image]%';

SELECT 'Migration 0012_fix_image_search_vector completed successfully' as status;
