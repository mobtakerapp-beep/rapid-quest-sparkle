
-- 1) Quiz answer leakage via REST: restrict direct SELECT on quizzes
DROP POLICY IF EXISTS quizzes_select ON public.quizzes;
CREATE POLICY quizzes_select ON public.quizzes
  FOR SELECT TO authenticated
  USING (auth.uid() = created_by OR public.is_teacher(auth.uid()));

-- 2) Profile points/warning_count tampering guard
CREATE OR REPLACE FUNCTION public.guard_profile_protected_cols()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    NEW.points := OLD.points;
    NEW.warning_count := OLD.warning_count;
    NEW.is_banned := OLD.is_banned;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_guard_profile_protected ON public.profiles;
CREATE TRIGGER trg_guard_profile_protected
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_profile_protected_cols();

-- 3) Cross-teacher quiz attempt grade tampering
DROP POLICY IF EXISTS qa_update_teacher ON public.quiz_attempts;
CREATE POLICY qa_update_teacher ON public.quiz_attempts
  FOR UPDATE TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.quizzes q
            WHERE q.id = quiz_attempts.quiz_id
              AND (q.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role)))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.quizzes q
            WHERE q.id = quiz_attempts.quiz_id
              AND (q.created_by = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role)))
  );

-- 4) Lock down award_weekly_top
REVOKE EXECUTE ON FUNCTION public.award_weekly_top() FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.award_weekly_top() TO service_role;

-- Make the function a no-op for non-admins (in case it's called via service role pathways elsewhere)
CREATE OR REPLACE FUNCTION public.award_weekly_top()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE wk date := date_trunc('week', now())::date; s_id uuid; s_pts int; t_id uuid; t_pts int;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RETURN;
  END IF;
  SELECT id, points INTO s_id, s_pts FROM public.profiles
    WHERE COALESCE(role_type,'student') NOT IN ('teacher','supervisor','admin')
    ORDER BY points DESC NULLS LAST LIMIT 1;
  IF s_id IS NOT NULL THEN
    INSERT INTO public.weekly_top(week_start, role_type, user_id, points)
      VALUES(wk,'student',s_id,COALESCE(s_pts,0))
      ON CONFLICT (week_start, role_type) DO UPDATE SET user_id=EXCLUDED.user_id, points=EXCLUDED.points;
  END IF;
  SELECT id, points INTO t_id, t_pts FROM public.profiles
    WHERE role_type IN ('teacher','supervisor')
    ORDER BY points DESC NULLS LAST LIMIT 1;
  IF t_id IS NOT NULL THEN
    INSERT INTO public.weekly_top(week_start, role_type, user_id, points)
      VALUES(wk,'teacher',t_id,COALESCE(t_pts,0))
      ON CONFLICT (week_start, role_type) DO UPDATE SET user_id=EXCLUDED.user_id, points=EXCLUDED.points;
  END IF;
END; $function$;

-- 5) Competition submissions: explicit authenticated role
DROP POLICY IF EXISTS cs_insert ON public.competition_submissions;
CREATE POLICY cs_insert ON public.competition_submissions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 6) Prevent vote stuffing
DELETE FROM public.gallery_contest_votes a
  USING public.gallery_contest_votes b
  WHERE a.ctid < b.ctid AND a.entry_id = b.entry_id AND a.user_id = b.user_id;
ALTER TABLE public.gallery_contest_votes
  ADD CONSTRAINT gallery_contest_votes_entry_user_uniq UNIQUE (entry_id, user_id);
