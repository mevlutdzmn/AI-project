-- Migration: Enable RLS on tables (NestJS backend - service_role only)
-- Date: 2025-12-25
-- Note: Since we use NestJS backend with JWT (not Supabase Auth), 
--       we restrict direct DB access and allow only service_role

-- =====================================================
-- 1. AUDIT_LOGS - Only backend can access
-- =====================================================
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Backend only access audit_logs" ON public.audit_logs;
CREATE POLICY "Backend only access audit_logs"
ON public.audit_logs FOR ALL TO service_role
USING (true) WITH CHECK (true);

-- Block anon access completely
DROP POLICY IF EXISTS "Block anon audit_logs" ON public.audit_logs;
CREATE POLICY "Block anon audit_logs"
ON public.audit_logs FOR ALL TO anon
USING (false) WITH CHECK (false);

-- =====================================================
-- 2. AUTH_SESSIONS - Only backend can access
-- =====================================================
ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Backend only access auth_sessions" ON public.auth_sessions;
CREATE POLICY "Backend only access auth_sessions"
ON public.auth_sessions FOR ALL TO service_role
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Block anon auth_sessions" ON public.auth_sessions;
CREATE POLICY "Block anon auth_sessions"
ON public.auth_sessions FOR ALL TO anon
USING (false) WITH CHECK (false);

-- =====================================================
-- 3. USERS - Only backend can access
-- =====================================================
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Backend only access users" ON public.users;
CREATE POLICY "Backend only access users"
ON public.users FOR ALL TO service_role
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Block anon users" ON public.users;
CREATE POLICY "Block anon users"
ON public.users FOR ALL TO anon
USING (false) WITH CHECK (false);

-- =====================================================
-- 4. SESSIONS (chat sessions) - Only backend can access
-- =====================================================
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Backend only access sessions" ON public.sessions;
CREATE POLICY "Backend only access sessions"
ON public.sessions FOR ALL TO service_role
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Block anon sessions" ON public.sessions;
CREATE POLICY "Block anon sessions"
ON public.sessions FOR ALL TO anon
USING (false) WITH CHECK (false);

-- =====================================================
-- 5. MESSAGES - Only backend can access
-- =====================================================
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Backend only access messages" ON public.messages;
CREATE POLICY "Backend only access messages"
ON public.messages FOR ALL TO service_role
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Block anon messages" ON public.messages;
CREATE POLICY "Block anon messages"
ON public.messages FOR ALL TO anon
USING (false) WITH CHECK (false);

-- =====================================================
-- 6. PAYMENTS - Only backend can access
-- =====================================================
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Backend only access payments" ON public.payments;
CREATE POLICY "Backend only access payments"
ON public.payments FOR ALL TO service_role
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Block anon payments" ON public.payments;
CREATE POLICY "Block anon payments"
ON public.payments FOR ALL TO anon
USING (false) WITH CHECK (false);

-- =====================================================
-- 7. USER_SETTINGS - Only backend can access
-- =====================================================
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Backend only access user_settings" ON public.user_settings;
CREATE POLICY "Backend only access user_settings"
ON public.user_settings FOR ALL TO service_role
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Block anon user_settings" ON public.user_settings;
CREATE POLICY "Block anon user_settings"
ON public.user_settings FOR ALL TO anon
USING (false) WITH CHECK (false);

-- =====================================================
-- 8. USER_MEMORIES - Only backend can access
-- =====================================================
ALTER TABLE public.user_memories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Backend only access user_memories" ON public.user_memories;
CREATE POLICY "Backend only access user_memories"
ON public.user_memories FOR ALL TO service_role
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Block anon user_memories" ON public.user_memories;
CREATE POLICY "Block anon user_memories"
ON public.user_memories FOR ALL TO anon
USING (false) WITH CHECK (false);

-- =====================================================
-- 9. PENDING_USERS - Only backend can access
-- =====================================================
ALTER TABLE public.pending_users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Backend only access pending_users" ON public.pending_users;
CREATE POLICY "Backend only access pending_users"
ON public.pending_users FOR ALL TO service_role
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Block anon pending_users" ON public.pending_users;
CREATE POLICY "Block anon pending_users"
ON public.pending_users FOR ALL TO anon
USING (false) WITH CHECK (false);

-- =====================================================
-- 10. SHARED_CHATS - Only backend can access
-- =====================================================
ALTER TABLE public.shared_chats ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Backend only access shared_chats" ON public.shared_chats;
CREATE POLICY "Backend only access shared_chats"
ON public.shared_chats FOR ALL TO service_role
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Block anon shared_chats" ON public.shared_chats;
CREATE POLICY "Block anon shared_chats"
ON public.shared_chats FOR ALL TO anon
USING (false) WITH CHECK (false);

-- =====================================================
-- 11. SHARED_MESSAGES - Only backend can access
-- =====================================================
ALTER TABLE public.shared_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Backend only access shared_messages" ON public.shared_messages;
CREATE POLICY "Backend only access shared_messages"
ON public.shared_messages FOR ALL TO service_role
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Block anon shared_messages" ON public.shared_messages;
CREATE POLICY "Block anon shared_messages"
ON public.shared_messages FOR ALL TO anon
USING (false) WITH CHECK (false);

-- =====================================================
-- 12. CUSTOM_INSTRUCTIONS - Only backend can access
-- =====================================================
ALTER TABLE public.custom_instructions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Backend only access custom_instructions" ON public.custom_instructions;
CREATE POLICY "Backend only access custom_instructions"
ON public.custom_instructions FOR ALL TO service_role
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Block anon custom_instructions" ON public.custom_instructions;
CREATE POLICY "Block anon custom_instructions"
ON public.custom_instructions FOR ALL TO anon
USING (false) WITH CHECK (false);

-- =====================================================
-- 13. USAGE_LOGS - Only backend can access
-- =====================================================
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Backend only access usage_logs" ON public.usage_logs;
CREATE POLICY "Backend only access usage_logs"
ON public.usage_logs FOR ALL TO service_role
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Block anon usage_logs" ON public.usage_logs;
CREATE POLICY "Block anon usage_logs"
ON public.usage_logs FOR ALL TO anon
USING (false) WITH CHECK (false);

-- =====================================================
-- 14. FOLDERS - Only backend can access
-- =====================================================
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Backend only access folders" ON public.folders;
CREATE POLICY "Backend only access folders"
ON public.folders FOR ALL TO service_role
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Block anon folders" ON public.folders;
CREATE POLICY "Block anon folders"
ON public.folders FOR ALL TO anon
USING (false) WITH CHECK (false);
