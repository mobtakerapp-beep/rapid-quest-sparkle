-- Blocks between users + helpers + reports extension + supervisors listing
-- Paste this in Supabase SQL Editor and Run.

-- 1) user_blocks table
CREATE TABLE IF NOT EXISTS public.user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id)
);
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "blocks_select_own" ON public.user_blocks;
CREATE POLICY "blocks_select_own" ON public.user_blocks
  FOR SELECT TO authenticated USING (auth.uid() = blocker_id);

DROP POLICY IF EXISTS "blocks_insert_own" ON public.user_blocks;
CREATE POLICY "blocks_insert_own" ON public.user_blocks
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = blocker_id AND blocker_id <> blocked_id);

DROP POLICY IF EXISTS "blocks_delete_own" ON public.user_blocks;
CREATE POLICY "blocks_delete_own" ON public.user_blocks
  FOR DELETE TO authenticated USING (auth.uid() = blocker_id);

-- 2) Helper: is_blocked (either direction)
CREATE OR REPLACE FUNCTION public.is_blocked(_a uuid, _b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = _a AND blocked_id = _b)
       OR (blocker_id = _b AND blocked_id = _a)
  );
$$;

-- 3) Block sending DMs to/from blocked users via RLS
DO $$ BEGIN
  ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
EXCEPTION WHEN others THEN NULL; END $$;

DROP POLICY IF EXISTS "dm_insert_not_blocked" ON public.direct_messages;
CREATE POLICY "dm_insert_not_blocked" ON public.direct_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND NOT public.is_blocked(sender_id, receiver_id)
  );

-- 4) Extend reports with optional reported_user_id
DO $$ BEGIN
  ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS reported_user_id uuid;
EXCEPTION WHEN others THEN NULL; END $$;

DROP POLICY IF EXISTS "reports_insert_own" ON public.reports;
CREATE POLICY "reports_insert_own" ON public.reports
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "reports_select_admins" ON public.reports;
CREATE POLICY "reports_select_admins" ON public.reports
  FOR SELECT TO authenticated USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR public.has_role(auth.uid(), 'supervisor'::public.app_role)
  );

-- 5) Public listing of supervisors/admins
CREATE OR REPLACE FUNCTION public.list_supervisors()
RETURNS TABLE (id uuid, display_name text, avatar_url text, role text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (p.id)
    p.id,
    p.display_name,
    p.avatar_url,
    ur.role::text
  FROM public.user_roles ur
  JOIN public.profiles p ON p.id = ur.user_id
  WHERE ur.role IN ('admin'::public.app_role, 'supervisor'::public.app_role)
  ORDER BY p.id, ur.role;
$$;

GRANT EXECUTE ON FUNCTION public.list_supervisors() TO authenticated, anon;
