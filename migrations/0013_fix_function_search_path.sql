-- =====================================================
-- Migration: Fix Function Search Path Security Issues
-- Date: 2026-01-02
-- Description: Fixes "mutable search_path" security warnings
-- =====================================================
-- Security Issue: Functions without SET search_path are vulnerable to
-- search_path manipulation attacks where malicious users could inject
-- their own functions/schemas into the search path.
-- =====================================================

-- =====================================================
-- 1. Fix sessions_search_vector_update function
-- =====================================================
CREATE OR REPLACE FUNCTION public.sessions_search_vector_update() 
RETURNS trigger 
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  NEW.search_vector := to_tsvector('english', COALESCE(NEW.title, ''));
  RETURN NEW;
END;
$$;

-- =====================================================
-- 2. Fix extract_message_text function
-- =====================================================
CREATE OR REPLACE FUNCTION public.extract_message_text(content jsonb) 
RETURNS text 
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = public
AS $$
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
$$;

-- =====================================================
-- 3. Fix messages_search_vector_update function
-- =====================================================
CREATE OR REPLACE FUNCTION public.messages_search_vector_update() 
RETURNS trigger 
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF NEW.role IN ('user', 'assistant') THEN
    NEW.search_vector := to_tsvector('english', public.extract_message_text(NEW.content));
  END IF;
  RETURN NEW;
END;
$$;

-- =====================================================
-- 4. Fix search_rank_boost function (if exists)
-- =====================================================
CREATE OR REPLACE FUNCTION public.search_rank_boost(
  created_at timestamp,
  is_pinned boolean,
  match_count int
) 
RETURNS float 
LANGUAGE plpgsql
IMMUTABLE
SECURITY INVOKER
SET search_path = public
AS $$
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
$$;

-- =====================================================
-- 5. Fix update_user_settings_updated_at function
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_user_settings_updated_at()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- =====================================================
-- 6. Fix update_updated_at_column function
-- =====================================================
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$;

-- =====================================================
-- Verification Query
-- =====================================================
-- Run this to verify all functions have secure search_path:
--
-- SELECT 
--   p.proname as function_name,
--   p.prosecdef as security_definer,
--   p.proconfig as config
-- FROM pg_proc p
-- JOIN pg_namespace n ON p.pronamespace = n.oid
-- WHERE n.nspname = 'public'
-- AND p.prolang = (SELECT oid FROM pg_language WHERE lanname = 'plpgsql');
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '✅ Function search_path security fixes applied successfully!';
  RAISE NOTICE 'Fixed functions:';
  RAISE NOTICE '  - sessions_search_vector_update';
  RAISE NOTICE '  - extract_message_text';
  RAISE NOTICE '  - messages_search_vector_update';
  RAISE NOTICE '  - search_rank_boost';
  RAISE NOTICE '  - update_user_settings_updated_at';
  RAISE NOTICE '  - update_updated_at_column';
END $$;
