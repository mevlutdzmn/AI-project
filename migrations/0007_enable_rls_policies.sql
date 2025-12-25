-- Migration: Enable RLS on all public tables
-- Date: 2025-12-25
-- Description: Enables Row Level Security and creates policies for all tables

-- =====================================================
-- 1. AUDIT_LOGS - Only admins can read, system can write
-- =====================================================
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Service role (backend) can do everything
CREATE POLICY "Service role full access on audit_logs"
ON public.audit_logs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Users can only see their own audit logs
CREATE POLICY "Users can view own audit logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- =====================================================
-- 2. AUTH_SESSIONS - Users can only manage their own sessions
-- =====================================================
ALTER TABLE public.auth_sessions ENABLE ROW LEVEL SECURITY;

-- Service role (backend) can do everything
CREATE POLICY "Service role full access on auth_sessions"
ON public.auth_sessions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Users can view their own sessions
CREATE POLICY "Users can view own sessions"
ON public.auth_sessions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Users can delete their own sessions (logout)
CREATE POLICY "Users can delete own sessions"
ON public.auth_sessions
FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- =====================================================
-- 3. GOOGLE_CONNECTIONS - Users can only manage their own
-- =====================================================
ALTER TABLE public.google_connections ENABLE ROW LEVEL SECURITY;

-- Service role (backend) can do everything
CREATE POLICY "Service role full access on google_connections"
ON public.google_connections
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Users can manage their own Google connections
CREATE POLICY "Users can manage own google connections"
ON public.google_connections
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- =====================================================
-- 4. USER_TOOL_PERMISSIONS - Users can only see/manage their own
-- =====================================================
ALTER TABLE public.user_tool_permissions ENABLE ROW LEVEL SECURITY;

-- Service role (backend) can do everything
CREATE POLICY "Service role full access on user_tool_permissions"
ON public.user_tool_permissions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Users can view their own tool permissions
CREATE POLICY "Users can view own tool permissions"
ON public.user_tool_permissions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Users can update their own tool permissions
CREATE POLICY "Users can update own tool permissions"
ON public.user_tool_permissions
FOR UPDATE
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- =====================================================
-- 5. TOOL_EXECUTIONS - Users can only see their own executions
-- =====================================================
ALTER TABLE public.tool_executions ENABLE ROW LEVEL SECURITY;

-- Service role (backend) can do everything
CREATE POLICY "Service role full access on tool_executions"
ON public.tool_executions
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Users can view their own tool executions
CREATE POLICY "Users can view own tool executions"
ON public.tool_executions
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- =====================================================
-- 6. CANVASES - Users can manage their own canvases
-- =====================================================
ALTER TABLE public.canvases ENABLE ROW LEVEL SECURITY;

-- Service role (backend) can do everything
CREATE POLICY "Service role full access on canvases"
ON public.canvases
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Users can manage their own canvases
CREATE POLICY "Users can manage own canvases"
ON public.canvases
FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- =====================================================
-- 7. CANVAS_SHARES - Complex: owner can manage, shared users can view
-- =====================================================
ALTER TABLE public.canvas_shares ENABLE ROW LEVEL SECURITY;

-- Service role (backend) can do everything
CREATE POLICY "Service role full access on canvas_shares"
ON public.canvas_shares
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Canvas owners can manage shares (via join to canvases)
CREATE POLICY "Canvas owners can manage shares"
ON public.canvas_shares
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.canvases 
    WHERE canvases.id = canvas_shares.canvas_id 
    AND canvases.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.canvases 
    WHERE canvases.id = canvas_shares.canvas_id 
    AND canvases.user_id = auth.uid()
  )
);

-- Shared users can view their share records
CREATE POLICY "Shared users can view their shares"
ON public.canvas_shares
FOR SELECT
TO authenticated
USING (shared_with_user_id = auth.uid());

-- =====================================================
-- 8. CANVAS_PATCHES - Users can manage patches on their canvases
-- =====================================================
ALTER TABLE public.canvas_patches ENABLE ROW LEVEL SECURITY;

-- Service role (backend) can do everything
CREATE POLICY "Service role full access on canvas_patches"
ON public.canvas_patches
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Users can manage patches on their own canvases
CREATE POLICY "Users can manage own canvas patches"
ON public.canvas_patches
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.canvases 
    WHERE canvases.id = canvas_patches.canvas_id 
    AND canvases.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.canvases 
    WHERE canvases.id = canvas_patches.canvas_id 
    AND canvases.user_id = auth.uid()
  )
);

-- Shared users with edit permission can manage patches
CREATE POLICY "Shared users can manage patches"
ON public.canvas_patches
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.canvas_shares 
    WHERE canvas_shares.canvas_id = canvas_patches.canvas_id 
    AND canvas_shares.shared_with_user_id = auth.uid()
    AND canvas_shares.permission IN ('edit', 'admin')
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.canvas_shares 
    WHERE canvas_shares.canvas_id = canvas_patches.canvas_id 
    AND canvas_shares.shared_with_user_id = auth.uid()
    AND canvas_shares.permission IN ('edit', 'admin')
  )
);

-- =====================================================
-- 9. CANVAS_SNAPSHOTS - Users can manage snapshots on their canvases
-- =====================================================
ALTER TABLE public.canvas_snapshots ENABLE ROW LEVEL SECURITY;

-- Service role (backend) can do everything
CREATE POLICY "Service role full access on canvas_snapshots"
ON public.canvas_snapshots
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Users can manage snapshots on their own canvases
CREATE POLICY "Users can manage own canvas snapshots"
ON public.canvas_snapshots
FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.canvases 
    WHERE canvases.id = canvas_snapshots.canvas_id 
    AND canvases.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.canvases 
    WHERE canvases.id = canvas_snapshots.canvas_id 
    AND canvases.user_id = auth.uid()
  )
);

-- Shared users can view snapshots
CREATE POLICY "Shared users can view snapshots"
ON public.canvas_snapshots
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.canvas_shares 
    WHERE canvas_shares.canvas_id = canvas_snapshots.canvas_id 
    AND canvas_shares.shared_with_user_id = auth.uid()
  )
);

-- =====================================================
-- Grant necessary permissions to service_role
-- =====================================================
GRANT ALL ON public.audit_logs TO service_role;
GRANT ALL ON public.auth_sessions TO service_role;
GRANT ALL ON public.google_connections TO service_role;
GRANT ALL ON public.user_tool_permissions TO service_role;
GRANT ALL ON public.tool_executions TO service_role;
GRANT ALL ON public.canvases TO service_role;
GRANT ALL ON public.canvas_shares TO service_role;
GRANT ALL ON public.canvas_patches TO service_role;
GRANT ALL ON public.canvas_snapshots TO service_role;

-- =====================================================
-- Verify RLS is enabled
-- =====================================================
DO $$
DECLARE
  tbl TEXT;
  rls_enabled BOOLEAN;
BEGIN
  FOR tbl IN 
    SELECT unnest(ARRAY[
      'audit_logs', 'auth_sessions', 'google_connections', 
      'user_tool_permissions', 'tool_executions', 'canvases',
      'canvas_shares', 'canvas_patches', 'canvas_snapshots'
    ])
  LOOP
    SELECT relrowsecurity INTO rls_enabled
    FROM pg_class
    WHERE relname = tbl AND relnamespace = 'public'::regnamespace;
    
    IF NOT rls_enabled THEN
      RAISE EXCEPTION 'RLS not enabled on table: %', tbl;
    END IF;
  END LOOP;
  
  RAISE NOTICE 'All tables have RLS enabled successfully!';
END $$;
