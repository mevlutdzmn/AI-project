-- Migration: Enable RLS on existing tables
-- Date: 2025-12-25

-- =====================================================
-- 1. AUDIT_LOGS
-- =====================================================
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on audit_logs" ON public.audit_logs;
CREATE POLICY "Service role full access on audit_logs"
ON public.audit_logs FOR ALL TO service_role
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own audit logs" ON public.audit_logs;
CREATE POLICY "Users can view own audit logs"
ON public.audit_logs FOR SELECT TO authenticated
USING (user_id = auth.uid());

-- =====================================================
-- 2. AUTH_SESSIONS
-- =====================================================
ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Service role full access on auth_sessions" ON public.auth_sessions;
CREATE POLICY "Service role full access on auth_sessions"
ON public.auth_sessions FOR ALL TO service_role
USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Users can view own sessions" ON public.auth_sessions;
CREATE POLICY "Users can view own sessions"
ON public.auth_sessions FOR SELECT TO authenticated
USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can delete own sessions" ON public.auth_sessions;
CREATE POLICY "Users can delete own sessions"
ON public.auth_sessions FOR DELETE TO authenticated
USING (user_id = auth.uid());
