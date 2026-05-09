-- Profile extra columns
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS teacher_id uuid,
  ADD COLUMN IF NOT EXISTS class_code text UNIQUE,
  ADD COLUMN IF NOT EXISTS country text DEFAULT 'سلطنة عُمان',
  ADD COLUMN IF NOT EXISTS school text,
  ADD COLUMN IF NOT EXISTS gender text;

ALTER TABLE public.direct_messages ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.competitions ADD COLUMN IF NOT EXISTS image_url text;
ALTER TABLE public.activities ALTER COLUMN file_url DROP NOT NULL;
ALTER TABLE public.activities ALTER COLUMN file_type DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_teacher_id ON public.profiles(teacher_id);

CREATE OR REPLACE FUNCTION public.generate_class_code()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE c text; n int;
BEGIN
  LOOP
    c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    SELECT count(*) INTO n FROM public.profiles WHERE class_code = c;
    EXIT WHEN n = 0;
  END LOOP;
  RETURN c;
END; $$;

-- Certificates
CREATE TABLE IF NOT EXISTS public.certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL,
  student_id uuid NOT NULL,
  title text NOT NULL,
  body text,
  image_url text,
  bg text DEFAULT 'gold',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS certificates_select ON public.certificates;
DROP POLICY IF EXISTS certificates_insert_teacher ON public.certificates;
DROP POLICY IF EXISTS certificates_delete ON public.certificates;
CREATE POLICY certificates_select ON public.certificates FOR SELECT USING (auth.uid()=student_id OR auth.uid()=teacher_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY certificates_insert_teacher ON public.certificates FOR INSERT WITH CHECK (auth.uid()=teacher_id AND public.is_teacher(auth.uid()));
CREATE POLICY certificates_delete ON public.certificates FOR DELETE USING (auth.uid()=teacher_id OR public.has_role(auth.uid(),'admin'));

-- Competition comments
CREATE TABLE IF NOT EXISTS public.competition_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.competition_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cc_select ON public.competition_comments;
DROP POLICY IF EXISTS cc_insert ON public.competition_comments;
DROP POLICY IF EXISTS cc_delete ON public.competition_comments;
CREATE POLICY cc_select ON public.competition_comments FOR SELECT USING (true);
CREATE POLICY cc_insert ON public.competition_comments FOR INSERT WITH CHECK (auth.uid()=user_id AND NOT public.is_banned(auth.uid()));
CREATE POLICY cc_delete ON public.competition_comments FOR DELETE USING (auth.uid()=user_id OR public.has_role(auth.uid(),'admin'));

-- Reactions
CREATE TABLE IF NOT EXISTS public.reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL,
  target_id uuid NOT NULL,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_type, target_id, user_id, emoji)
);
ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS reactions_select ON public.reactions;
DROP POLICY IF EXISTS reactions_insert ON public.reactions;
DROP POLICY IF EXISTS reactions_delete ON public.reactions;
CREATE POLICY reactions_select ON public.reactions FOR SELECT USING (true);
CREATE POLICY reactions_insert ON public.reactions FOR INSERT WITH CHECK (auth.uid()=user_id);
CREATE POLICY reactions_delete ON public.reactions FOR DELETE USING (auth.uid()=user_id);

-- Gallery contests
CREATE TABLE IF NOT EXISTS public.gallery_contests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  category text NOT NULL DEFAULT 'drawing',
  cover_url text,
  ends_at timestamptz,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gallery_contests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gco_select ON public.gallery_contests;
DROP POLICY IF EXISTS gco_insert ON public.gallery_contests;
DROP POLICY IF EXISTS gco_update ON public.gallery_contests;
DROP POLICY IF EXISTS gco_delete ON public.gallery_contests;
CREATE POLICY gco_select ON public.gallery_contests FOR SELECT USING (true);
CREATE POLICY gco_insert ON public.gallery_contests FOR INSERT WITH CHECK (auth.uid()=created_by AND public.is_teacher(auth.uid()));
CREATE POLICY gco_update ON public.gallery_contests FOR UPDATE USING (auth.uid()=created_by OR public.has_role(auth.uid(),'admin'));
CREATE POLICY gco_delete ON public.gallery_contests FOR DELETE USING (auth.uid()=created_by OR public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.gallery_contest_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id uuid NOT NULL REFERENCES public.gallery_contests(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  media_url text NOT NULL,
  caption text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (contest_id, user_id)
);
ALTER TABLE public.gallery_contest_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gce_select ON public.gallery_contest_entries;
DROP POLICY IF EXISTS gce_insert ON public.gallery_contest_entries;
DROP POLICY IF EXISTS gce_delete ON public.gallery_contest_entries;
CREATE POLICY gce_select ON public.gallery_contest_entries FOR SELECT USING (true);
CREATE POLICY gce_insert ON public.gallery_contest_entries FOR INSERT WITH CHECK (auth.uid()=user_id AND NOT public.is_banned(auth.uid()));
CREATE POLICY gce_delete ON public.gallery_contest_entries FOR DELETE USING (auth.uid()=user_id OR public.has_role(auth.uid(),'admin'));

CREATE TABLE IF NOT EXISTS public.gallery_contest_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES public.gallery_contest_entries(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entry_id, user_id)
);
ALTER TABLE public.gallery_contest_votes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS gcv_select ON public.gallery_contest_votes;
DROP POLICY IF EXISTS gcv_insert ON public.gallery_contest_votes;
DROP POLICY IF EXISTS gcv_delete ON public.gallery_contest_votes;
CREATE POLICY gcv_select ON public.gallery_contest_votes FOR SELECT USING (true);
CREATE POLICY gcv_insert ON public.gallery_contest_votes FOR INSERT WITH CHECK (auth.uid()=user_id AND NOT public.is_banned(auth.uid()));
CREATE POLICY gcv_delete ON public.gallery_contest_votes FOR DELETE USING (auth.uid()=user_id);

-- Weekly top
CREATE TABLE IF NOT EXISTS public.weekly_top (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL,
  role_type text NOT NULL DEFAULT 'student',
  user_id uuid NOT NULL,
  points int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (week_start, role_type)
);
ALTER TABLE public.weekly_top ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wt_select ON public.weekly_top;
DROP POLICY IF EXISTS wt_admin ON public.weekly_top;
CREATE POLICY wt_select ON public.weekly_top FOR SELECT USING (true);
CREATE POLICY wt_admin ON public.weekly_top FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.award_weekly_top()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE wk date := date_trunc('week', now())::date; s_id uuid; s_pts int; t_id uuid; t_pts int;
BEGIN
  SELECT id, points INTO s_id, s_pts FROM public.profiles
    WHERE COALESCE(role_type,'student') NOT IN ('teacher','supervisor')
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
END; $$;

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('dm-images','dm-images',true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('certificates','certificates',true) ON CONFLICT DO NOTHING;

-- Core RLS policies for batch1 tables (so apps actually read/write)
DROP POLICY IF EXISTS profiles_select_all ON public.profiles;
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
CREATE POLICY profiles_select_all ON public.profiles FOR SELECT USING (true);
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT WITH CHECK (auth.uid()=id);
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE USING (auth.uid()=id OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS user_roles_select_own ON public.user_roles;
DROP POLICY IF EXISTS user_roles_admin_all ON public.user_roles;
CREATE POLICY user_roles_select_own ON public.user_roles FOR SELECT USING (auth.uid()=user_id);
CREATE POLICY user_roles_admin_all ON public.user_roles FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS messages_select ON public.messages;
DROP POLICY IF EXISTS messages_insert ON public.messages;
DROP POLICY IF EXISTS messages_delete ON public.messages;
CREATE POLICY messages_select ON public.messages FOR SELECT USING (true);
CREATE POLICY messages_insert ON public.messages FOR INSERT WITH CHECK (auth.uid()=user_id AND NOT public.is_banned(auth.uid()));
CREATE POLICY messages_delete ON public.messages FOR DELETE USING (auth.uid()=user_id OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS reports_admin ON public.reports;
DROP POLICY IF EXISTS reports_insert ON public.reports;
CREATE POLICY reports_admin ON public.reports FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY reports_insert ON public.reports FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS activities_select ON public.activities;
DROP POLICY IF EXISTS activities_insert ON public.activities;
DROP POLICY IF EXISTS activities_delete ON public.activities;
CREATE POLICY activities_select ON public.activities FOR SELECT USING (status='approved' OR auth.uid()=user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY activities_insert ON public.activities FOR INSERT WITH CHECK (auth.uid()=user_id AND NOT public.is_banned(auth.uid()));
CREATE POLICY activities_delete ON public.activities FOR DELETE USING (auth.uid()=user_id OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS ac_select ON public.activity_comments;
DROP POLICY IF EXISTS ac_insert ON public.activity_comments;
DROP POLICY IF EXISTS ac_delete ON public.activity_comments;
CREATE POLICY ac_select ON public.activity_comments FOR SELECT USING (true);
CREATE POLICY ac_insert ON public.activity_comments FOR INSERT WITH CHECK (auth.uid()=user_id AND NOT public.is_banned(auth.uid()));
CREATE POLICY ac_delete ON public.activity_comments FOR DELETE USING (auth.uid()=user_id OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS gcom_select ON public.gallery_comments;
DROP POLICY IF EXISTS gcom_insert ON public.gallery_comments;
DROP POLICY IF EXISTS gcom_delete ON public.gallery_comments;
CREATE POLICY gcom_select ON public.gallery_comments FOR SELECT USING (true);
CREATE POLICY gcom_insert ON public.gallery_comments FOR INSERT WITH CHECK (auth.uid()=user_id AND NOT public.is_banned(auth.uid()));
CREATE POLICY gcom_delete ON public.gallery_comments FOR DELETE USING (auth.uid()=user_id OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS dm_select ON public.direct_messages;
DROP POLICY IF EXISTS dm_insert ON public.direct_messages;
DROP POLICY IF EXISTS dm_update ON public.direct_messages;
CREATE POLICY dm_select ON public.direct_messages FOR SELECT USING (auth.uid()=sender_id OR auth.uid()=receiver_id);
CREATE POLICY dm_insert ON public.direct_messages FOR INSERT WITH CHECK (auth.uid()=sender_id AND NOT public.is_banned(auth.uid()));
CREATE POLICY dm_update ON public.direct_messages FOR UPDATE USING (auth.uid()=receiver_id);

DROP POLICY IF EXISTS comp_select ON public.competitions;
DROP POLICY IF EXISTS comp_insert ON public.competitions;
DROP POLICY IF EXISTS comp_admin ON public.competitions;
CREATE POLICY comp_select ON public.competitions FOR SELECT USING (true);
CREATE POLICY comp_insert ON public.competitions FOR INSERT WITH CHECK (auth.uid()=created_by AND public.is_teacher(auth.uid()));
CREATE POLICY comp_admin ON public.competitions FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS cs_select ON public.competition_submissions;
DROP POLICY IF EXISTS cs_insert ON public.competition_submissions;
DROP POLICY IF EXISTS cs_update ON public.competition_submissions;
CREATE POLICY cs_select ON public.competition_submissions FOR SELECT USING (true);
CREATE POLICY cs_insert ON public.competition_submissions FOR INSERT WITH CHECK (auth.uid()=user_id);
CREATE POLICY cs_update ON public.competition_submissions FOR UPDATE USING (public.is_teacher(auth.uid())) WITH CHECK (public.is_teacher(auth.uid()));

DROP POLICY IF EXISTS notif_select ON public.notifications;
DROP POLICY IF EXISTS notif_update ON public.notifications;
DROP POLICY IF EXISTS notif_insert ON public.notifications;
CREATE POLICY notif_select ON public.notifications FOR SELECT USING (auth.uid()=user_id);
CREATE POLICY notif_update ON public.notifications FOR UPDATE USING (auth.uid()=user_id);
CREATE POLICY notif_insert ON public.notifications FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS asgn_select ON public.assignments;
DROP POLICY IF EXISTS asgn_insert ON public.assignments;
DROP POLICY IF EXISTS asgn_modify ON public.assignments;
CREATE POLICY asgn_select ON public.assignments FOR SELECT USING (true);
CREATE POLICY asgn_insert ON public.assignments FOR INSERT WITH CHECK (auth.uid()=teacher_id AND public.is_teacher(auth.uid()));
CREATE POLICY asgn_modify ON public.assignments FOR ALL USING (auth.uid()=teacher_id OR public.has_role(auth.uid(),'admin')) WITH CHECK (auth.uid()=teacher_id OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS asub_select ON public.assignment_submissions;
DROP POLICY IF EXISTS asub_insert ON public.assignment_submissions;
DROP POLICY IF EXISTS asub_update ON public.assignment_submissions;
CREATE POLICY asub_select ON public.assignment_submissions FOR SELECT USING (auth.uid()=student_id OR public.is_teacher(auth.uid()));
CREATE POLICY asub_insert ON public.assignment_submissions FOR INSERT WITH CHECK (auth.uid()=student_id);
CREATE POLICY asub_update ON public.assignment_submissions FOR UPDATE USING (public.is_teacher(auth.uid())) WITH CHECK (public.is_teacher(auth.uid()));

DROP POLICY IF EXISTS badges_select ON public.badges;
DROP POLICY IF EXISTS badges_admin ON public.badges;
CREATE POLICY badges_select ON public.badges FOR SELECT USING (true);
CREATE POLICY badges_admin ON public.badges FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS ub_select ON public.user_badges;
DROP POLICY IF EXISTS ub_insert ON public.user_badges;
CREATE POLICY ub_select ON public.user_badges FOR SELECT USING (true);
CREATE POLICY ub_insert ON public.user_badges FOR INSERT WITH CHECK (auth.uid()=user_id OR public.is_teacher(auth.uid()));

DROP POLICY IF EXISTS events_select ON public.events;
DROP POLICY IF EXISTS events_insert ON public.events;
DROP POLICY IF EXISTS events_modify ON public.events;
CREATE POLICY events_select ON public.events FOR SELECT USING (true);
CREATE POLICY events_insert ON public.events FOR INSERT WITH CHECK (auth.uid()=created_by AND public.is_teacher(auth.uid()));
CREATE POLICY events_modify ON public.events FOR ALL USING (auth.uid()=created_by OR public.has_role(auth.uid(),'admin')) WITH CHECK (auth.uid()=created_by OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS quizzes_select ON public.quizzes;
DROP POLICY IF EXISTS quizzes_insert ON public.quizzes;
DROP POLICY IF EXISTS quizzes_modify ON public.quizzes;
CREATE POLICY quizzes_select ON public.quizzes FOR SELECT USING (true);
CREATE POLICY quizzes_insert ON public.quizzes FOR INSERT WITH CHECK (auth.uid()=created_by AND public.is_teacher(auth.uid()));
CREATE POLICY quizzes_modify ON public.quizzes FOR ALL USING (auth.uid()=created_by OR public.has_role(auth.uid(),'admin')) WITH CHECK (auth.uid()=created_by OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS qa_select ON public.quiz_attempts;
DROP POLICY IF EXISTS qa_insert ON public.quiz_attempts;
CREATE POLICY qa_select ON public.quiz_attempts FOR SELECT USING (true);
CREATE POLICY qa_insert ON public.quiz_attempts FOR INSERT WITH CHECK (auth.uid()=user_id);