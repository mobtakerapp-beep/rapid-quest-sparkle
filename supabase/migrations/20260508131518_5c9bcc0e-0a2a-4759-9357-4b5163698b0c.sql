
-- Gallery contests (creative competitions)
CREATE TABLE public.gallery_contests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  category TEXT NOT NULL DEFAULT 'drawing', -- drawing | video | photo | other
  cover_url TEXT,
  ends_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.gallery_contests ENABLE ROW LEVEL SECURITY;
CREATE POLICY gc_select_all ON public.gallery_contests FOR SELECT USING (true);
CREATE POLICY gc_insert_teacher ON public.gallery_contests FOR INSERT WITH CHECK (auth.uid() = created_by AND public.is_teacher(auth.uid()));
CREATE POLICY gc_update_owner ON public.gallery_contests FOR UPDATE USING (auth.uid() = created_by OR public.has_role(auth.uid(),'admin'::app_role));
CREATE POLICY gc_delete_owner ON public.gallery_contests FOR DELETE USING (auth.uid() = created_by OR public.has_role(auth.uid(),'admin'::app_role));

CREATE TABLE public.gallery_contest_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contest_id UUID NOT NULL REFERENCES public.gallery_contests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  media_url TEXT NOT NULL,
  caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contest_id, user_id)
);
ALTER TABLE public.gallery_contest_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY gce_select_all ON public.gallery_contest_entries FOR SELECT USING (true);
CREATE POLICY gce_insert_own ON public.gallery_contest_entries FOR INSERT WITH CHECK (auth.uid() = user_id AND NOT public.is_banned(auth.uid()));
CREATE POLICY gce_delete_own ON public.gallery_contest_entries FOR DELETE USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'::app_role));

CREATE TABLE public.gallery_contest_votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id UUID NOT NULL REFERENCES public.gallery_contest_entries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entry_id, user_id)
);
ALTER TABLE public.gallery_contest_votes ENABLE ROW LEVEL SECURITY;
CREATE POLICY gcv_select_all ON public.gallery_contest_votes FOR SELECT USING (true);
CREATE POLICY gcv_insert_own ON public.gallery_contest_votes FOR INSERT WITH CHECK (auth.uid() = user_id AND NOT public.is_banned(auth.uid()));
CREATE POLICY gcv_delete_own ON public.gallery_contest_votes FOR DELETE USING (auth.uid() = user_id);

-- Student of the week (auto-awarded snapshot)
CREATE TABLE public.weekly_top (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  week_start DATE NOT NULL,
  role_type TEXT NOT NULL DEFAULT 'student', -- student | teacher
  user_id UUID NOT NULL,
  points INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (week_start, role_type)
);
ALTER TABLE public.weekly_top ENABLE ROW LEVEL SECURITY;
CREATE POLICY wt_select_all ON public.weekly_top FOR SELECT USING (true);
CREATE POLICY wt_admin_all ON public.weekly_top FOR ALL USING (public.has_role(auth.uid(),'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(),'admin'::app_role));

-- Function: compute and award student/teacher of the week
CREATE OR REPLACE FUNCTION public.award_weekly_top()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  wk DATE := date_trunc('week', now())::date;
  s_id UUID; s_pts INT;
  t_id UUID; t_pts INT;
BEGIN
  SELECT id, points INTO s_id, s_pts FROM public.profiles
    WHERE COALESCE(role_type,'student') NOT IN ('teacher','supervisor')
    ORDER BY points DESC NULLS LAST LIMIT 1;
  IF s_id IS NOT NULL THEN
    INSERT INTO public.weekly_top(week_start, role_type, user_id, points)
      VALUES(wk, 'student', s_id, COALESCE(s_pts,0))
      ON CONFLICT (week_start, role_type) DO UPDATE SET user_id = EXCLUDED.user_id, points = EXCLUDED.points;
    INSERT INTO public.user_badges(user_id, badge_id) VALUES (s_id, 'student_of_week') ON CONFLICT DO NOTHING;
    INSERT INTO public.notifications(user_id,type,title,body,link)
      VALUES(s_id,'badge','طالب الأسبوع 🌟','تهانينا! حصلت على لقب طالب الأسبوع','/profile');
  END IF;
  SELECT id, points INTO t_id, t_pts FROM public.profiles
    WHERE role_type IN ('teacher','supervisor')
    ORDER BY points DESC NULLS LAST LIMIT 1;
  IF t_id IS NOT NULL THEN
    INSERT INTO public.weekly_top(week_start, role_type, user_id, points)
      VALUES(wk, 'teacher', t_id, COALESCE(t_pts,0))
      ON CONFLICT (week_start, role_type) DO UPDATE SET user_id = EXCLUDED.user_id, points = EXCLUDED.points;
    INSERT INTO public.notifications(user_id,type,title,body,link)
      VALUES(t_id,'badge','معلم الأسبوع 🌟','تهانينا! حصلت على لقب معلم الأسبوع','/profile');
  END IF;
END;$$;

INSERT INTO public.badges(id,name,icon,color,description) VALUES
  ('student_of_week','طالب الأسبوع','🌟','amber','حاصل على أعلى نقاط هذا الأسبوع')
ON CONFLICT (id) DO NOTHING;

-- Schedule weekly award (Saturdays 00:05) via pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$ BEGIN
  PERFORM cron.unschedule('weekly-top-award');
EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule('weekly-top-award', '5 0 * * 6', $$ SELECT public.award_weekly_top(); $$);
