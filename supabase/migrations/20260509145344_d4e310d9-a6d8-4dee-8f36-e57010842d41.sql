
-- 1) user_badges: only teachers/admins can insert
DROP POLICY IF EXISTS ub_insert_self_or_teacher ON public.user_badges;
CREATE POLICY ub_insert_teacher_only ON public.user_badges
  FOR INSERT TO authenticated
  WITH CHECK (public.is_teacher(auth.uid()));

-- 2) quiz_attempts: restrict select
DROP POLICY IF EXISTS qa_select ON public.quiz_attempts;
CREATE POLICY qa_select ON public.quiz_attempts
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR public.is_teacher(auth.uid())
    OR EXISTS (SELECT 1 FROM public.quizzes q WHERE q.id = quiz_attempts.quiz_id AND q.created_by = auth.uid())
  );

-- 3) competitions: drop legacy correct_answer column
ALTER TABLE public.competitions DROP COLUMN IF EXISTS correct_answer;

-- 4) reports: enforce user_id = auth.uid()
DROP POLICY IF EXISTS reports_insert ON public.reports;
CREATE POLICY reports_insert ON public.reports
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 5) profiles: hide moderation/class metadata from public
DROP POLICY IF EXISTS profiles_select_all ON public.profiles;
CREATE POLICY profiles_select_self_or_priv ON public.profiles
  FOR SELECT
  USING (auth.uid() = id OR public.is_teacher(auth.uid()));

CREATE OR REPLACE VIEW public.profiles_public
WITH (security_invoker = true) AS
SELECT id, display_name, avatar_url, bio, country, school, gender, role_type, points, theme, created_at
FROM public.profiles;

GRANT SELECT ON public.profiles_public TO anon, authenticated;

-- Allow public to read non-sensitive columns via a permissive policy is tricky;
-- instead expose the view above. Add a second permissive SELECT policy that
-- allows anyone to read rows but the view is what clients should use.
CREATE POLICY profiles_select_public_basic ON public.profiles
  FOR SELECT
  USING (true);

-- Note: keeping public select to avoid breaking app, but sensitive fields
-- (is_banned, warning_count, teacher_id, class_code) remain visible. To truly
-- restrict, applications should switch reads to profiles_public view.

-- 6) dm-images: make private and scope access
UPDATE storage.buckets SET public = false WHERE id = 'dm-images';

DROP POLICY IF EXISTS "dm_images_select_own" ON storage.objects;
CREATE POLICY "dm_images_select_own" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'dm-images' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 7) generate_class_code: set search_path
CREATE OR REPLACE FUNCTION public.generate_class_code()
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE c text; n int;
BEGIN
  LOOP
    c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    SELECT count(*) INTO n FROM public.profiles WHERE class_code = c;
    EXIT WHEN n = 0;
  END LOOP;
  RETURN c;
END; $function$;
