DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'user', 'teacher', 'supervisor');
  END IF;
END $$;

DO $$ BEGIN
  BEGIN ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'teacher'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'supervisor'; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY,
  display_name TEXT,
  avatar_url TEXT,
  is_banned BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  role_type TEXT,
  bio TEXT,
  grade TEXT,
  phone TEXT,
  warning_count INT NOT NULL DEFAULT 0,
  points INTEGER NOT NULL DEFAULT 0,
  theme TEXT NOT NULL DEFAULT 'default',
  teacher_id uuid,
  class_code text UNIQUE,
  country text DEFAULT 'سلطنة عُمان',
  school text,
  gender text
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  content TEXT,
  image_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  category TEXT NOT NULL DEFAULT 'chat'
);
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS messages_category_idx ON public.messages(category, created_at DESC);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_banned(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE((SELECT is_banned FROM public.profiles WHERE id = _user_id), false)
$$;

CREATE OR REPLACE FUNCTION public.is_teacher(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
      OR public.has_role(_user_id, 'teacher'::public.app_role)
      OR public.has_role(_user_id, 'supervisor'::public.app_role)
$$;

CREATE OR REPLACE FUNCTION public.generate_class_code()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE c text; ec int;
BEGIN
  LOOP
    c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    SELECT count(*) INTO ec FROM public.profiles WHERE class_code = c;
    EXIT WHEN ec = 0;
  END LOOP;
  RETURN c;
END; $$;

CREATE OR REPLACE FUNCTION public.claim_admin_role(_code TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF _code <> 'WUSTA-A-2026' THEN RETURN false; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'admin') ON CONFLICT (user_id, role) DO NOTHING;
  UPDATE public.profiles SET role_type = COALESCE(role_type,'supervisor'),
       class_code = COALESCE(class_code, public.generate_class_code()) WHERE id = _uid;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.claim_teacher_role(_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid(); _existing text;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF _code <> 'WUSTA-T-2026' THEN RETURN false; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'teacher'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  SELECT class_code INTO _existing FROM public.profiles WHERE id = _uid;
  UPDATE public.profiles SET role_type = 'teacher',
    class_code = COALESCE(_existing, public.generate_class_code()) WHERE id = _uid;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url')
  ON CONFLICT (id) DO UPDATE SET
    display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name),
    avatar_url = COALESCE(public.profiles.avatar_url, EXCLUDED.avatar_url);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL, reason TEXT NOT NULL, content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subject text NOT NULL DEFAULT 'عام',
  title text NOT NULL,
  description text,
  file_url text,
  file_type text,
  file_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'approved'
);
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.activity_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL, user_id UUID NOT NULL,
  content TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.activity_comments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.gallery_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL, user_id uuid NOT NULL,
  content text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gallery_comments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL, receiver_id UUID NOT NULL,
  content TEXT NOT NULL, image_url text, read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL, description TEXT,
  question TEXT NOT NULL, correct_answer TEXT,
  image_url TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 300,
  starts_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ NOT NULL,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.competition_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL,
  user_id UUID NOT NULL,
  answer TEXT NOT NULL,
  image_url TEXT,
  link_url TEXT,
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  time_taken_seconds INTEGER NOT NULL DEFAULT 0,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  teacher_approved BOOLEAN NOT NULL DEFAULT false,
  approved_by UUID,
  UNIQUE (competition_id, user_id)
);
ALTER TABLE public.competition_submissions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.competition_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL, user_id uuid NOT NULL,
  content text NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.competition_comments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL, type TEXT NOT NULL,
  title TEXT NOT NULL, body TEXT, link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL, title TEXT NOT NULL,
  description TEXT, subject TEXT NOT NULL DEFAULT 'عام',
  due_at TIMESTAMPTZ, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.assignment_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL, content TEXT, file_url TEXT,
  grade INTEGER, feedback TEXT, graded_by UUID, graded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.badges (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, description TEXT,
  icon TEXT NOT NULL DEFAULT '🏅', color TEXT NOT NULL DEFAULT 'amber',
  audience TEXT NOT NULL DEFAULT 'student'
);
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.badges ADD COLUMN IF NOT EXISTS audience TEXT NOT NULL DEFAULT 'student';

CREATE TABLE IF NOT EXISTS public.user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  badge_id TEXT NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, badge_id)
);
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL, description TEXT,
  starts_at TIMESTAMPTZ NOT NULL, ends_at TIMESTAMPTZ,
  type TEXT NOT NULL DEFAULT 'general',
  created_by UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL, subject TEXT NOT NULL DEFAULT 'عام',
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL, score INTEGER NOT NULL DEFAULT 0, total INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL, student_id uuid NOT NULL,
  title text NOT NULL, body text, image_url text,
  bg text DEFAULT 'gold',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

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

CREATE TABLE IF NOT EXISTS public.gallery_contests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  title TEXT NOT NULL, description TEXT,
  category TEXT NOT NULL DEFAULT 'drawing',
  cover_url TEXT, ends_at TIMESTAMPTZ,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.gallery_contests ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.gallery_contest_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contest_id UUID NOT NULL REFERENCES public.gallery_contests(id) ON DELETE CASCADE,
  user_id UUID NOT NULL, media_url TEXT NOT NULL, caption TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contest_id, user_id)
);
ALTER TABLE public.gallery_contest_entries ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.gallery_contest_votes (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  entry_id UUID NOT NULL REFERENCES public.gallery_contest_entries(id) ON DELETE CASCADE,
  user_id UUID NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (entry_id, user_id)
);
ALTER TABLE public.gallery_contest_votes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.weekly_top (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  week_start DATE NOT NULL,
  role_type TEXT NOT NULL DEFAULT 'student',
  user_id UUID NOT NULL, points INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (week_start, role_type)
);
ALTER TABLE public.weekly_top ENABLE ROW LEVEL SECURITY;

-- Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES
  ('chat-images','chat-images',true),
  ('activity-files','activity-files',true),
  ('gallery-media','gallery-media',true),
  ('avatars','avatars',true),
  ('assignment-files','assignment-files',true),
  ('dm-images','dm-images',true),
  ('certificates','certificates',true),
  ('competition-media','competition-media',true),
  ('quiz-images','quiz-images',true)
ON CONFLICT (id) DO NOTHING;

-- RLS policies (drop+create for idempotency)
DROP POLICY IF EXISTS profiles_select_all ON public.profiles;
DROP POLICY IF EXISTS profiles_update_own ON public.profiles;
DROP POLICY IF EXISTS profiles_admin_update ON public.profiles;
DROP POLICY IF EXISTS profiles_insert_own ON public.profiles;
CREATE POLICY profiles_select_all ON public.profiles FOR SELECT USING (true);
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY profiles_admin_update ON public.profiles FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS user_roles_select_own ON public.user_roles;
DROP POLICY IF EXISTS user_roles_admin_all ON public.user_roles;
CREATE POLICY user_roles_select_own ON public.user_roles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY user_roles_admin_all ON public.user_roles FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS messages_select_all ON public.messages;
DROP POLICY IF EXISTS messages_insert_own ON public.messages;
DROP POLICY IF EXISTS messages_delete_own ON public.messages;
DROP POLICY IF EXISTS messages_admin_delete ON public.messages;
CREATE POLICY messages_select_all ON public.messages FOR SELECT USING (true);
CREATE POLICY messages_insert_own ON public.messages FOR INSERT WITH CHECK (auth.uid() = user_id AND NOT public.is_banned(auth.uid()));
CREATE POLICY messages_delete_own ON public.messages FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY messages_admin_delete ON public.messages FOR DELETE USING (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS reports_admin_all ON public.reports;
DROP POLICY IF EXISTS reports_insert_self ON public.reports;
CREATE POLICY reports_admin_all ON public.reports FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY reports_insert_self ON public.reports FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS activities_select_visible ON public.activities;
DROP POLICY IF EXISTS activities_insert_teacher ON public.activities;
DROP POLICY IF EXISTS activities_insert_any ON public.activities;
DROP POLICY IF EXISTS activities_delete_own ON public.activities;
DROP POLICY IF EXISTS activities_admin_delete ON public.activities;
DROP POLICY IF EXISTS activities_admin_update ON public.activities;
CREATE POLICY activities_select_visible ON public.activities FOR SELECT USING (status = 'approved' OR auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY activities_insert_teacher ON public.activities FOR INSERT WITH CHECK (auth.uid() = user_id AND public.is_teacher(auth.uid()) AND NOT public.is_banned(auth.uid()));
CREATE POLICY activities_delete_own ON public.activities FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY activities_admin_delete ON public.activities FOR DELETE USING (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS ac_select_all ON public.activity_comments;
DROP POLICY IF EXISTS ac_insert_own ON public.activity_comments;
DROP POLICY IF EXISTS ac_delete_own ON public.activity_comments;
CREATE POLICY ac_select_all ON public.activity_comments FOR SELECT USING (true);
CREATE POLICY ac_insert_own ON public.activity_comments FOR INSERT WITH CHECK (auth.uid() = user_id AND NOT public.is_banned(auth.uid()));
CREATE POLICY ac_delete_own ON public.activity_comments FOR DELETE USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS galc_select_all ON public.gallery_comments;
DROP POLICY IF EXISTS galc_insert_own ON public.gallery_comments;
DROP POLICY IF EXISTS galc_delete_own ON public.gallery_comments;
CREATE POLICY galc_select_all ON public.gallery_comments FOR SELECT USING (true);
CREATE POLICY galc_insert_own ON public.gallery_comments FOR INSERT WITH CHECK (auth.uid() = user_id AND NOT public.is_banned(auth.uid()));
CREATE POLICY galc_delete_own ON public.gallery_comments FOR DELETE USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS dm_select_own ON public.direct_messages;
DROP POLICY IF EXISTS dm_insert_own ON public.direct_messages;
DROP POLICY IF EXISTS dm_update_receiver ON public.direct_messages;
DROP POLICY IF EXISTS dm_delete_own ON public.direct_messages;
CREATE POLICY dm_select_own ON public.direct_messages FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY dm_insert_own ON public.direct_messages FOR INSERT WITH CHECK (auth.uid() = sender_id AND NOT public.is_banned(auth.uid()));
CREATE POLICY dm_update_receiver ON public.direct_messages FOR UPDATE USING (auth.uid() = receiver_id);
CREATE POLICY dm_delete_own ON public.direct_messages FOR DELETE USING (auth.uid() = sender_id OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS comp_select_all ON public.competitions;
DROP POLICY IF EXISTS comp_insert_teacher ON public.competitions;
DROP POLICY IF EXISTS comp_update_owner ON public.competitions;
DROP POLICY IF EXISTS comp_delete_owner ON public.competitions;
CREATE POLICY comp_select_all ON public.competitions FOR SELECT USING (true);
CREATE POLICY comp_insert_teacher ON public.competitions FOR INSERT WITH CHECK (auth.uid() = created_by AND public.is_teacher(auth.uid()));
CREATE POLICY comp_update_owner ON public.competitions FOR UPDATE USING (auth.uid() = created_by OR public.has_role(auth.uid(),'admin')) WITH CHECK (auth.uid() = created_by OR public.has_role(auth.uid(),'admin'));
CREATE POLICY comp_delete_owner ON public.competitions FOR DELETE USING (auth.uid() = created_by OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS cs_select_all ON public.competition_submissions;
DROP POLICY IF EXISTS cs_insert_own ON public.competition_submissions;
DROP POLICY IF EXISTS cs_update_teacher ON public.competition_submissions;
DROP POLICY IF EXISTS cs_delete_own ON public.competition_submissions;
CREATE POLICY cs_select_all ON public.competition_submissions FOR SELECT USING (true);
CREATE POLICY cs_insert_own ON public.competition_submissions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY cs_update_teacher ON public.competition_submissions FOR UPDATE USING (public.is_teacher(auth.uid())) WITH CHECK (public.is_teacher(auth.uid()));
CREATE POLICY cs_delete_own ON public.competition_submissions FOR DELETE USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS cc_select_all ON public.competition_comments;
DROP POLICY IF EXISTS cc_insert_own ON public.competition_comments;
DROP POLICY IF EXISTS cc_delete_own ON public.competition_comments;
CREATE POLICY cc_select_all ON public.competition_comments FOR SELECT USING (true);
CREATE POLICY cc_insert_own ON public.competition_comments FOR INSERT WITH CHECK (auth.uid() = user_id AND NOT public.is_banned(auth.uid()));
CREATE POLICY cc_delete_own ON public.competition_comments FOR DELETE USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS notif_select_own ON public.notifications;
DROP POLICY IF EXISTS notif_update_own ON public.notifications;
DROP POLICY IF EXISTS notif_delete_own ON public.notifications;
DROP POLICY IF EXISTS notif_insert_any ON public.notifications;
CREATE POLICY notif_select_own ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY notif_update_own ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY notif_delete_own ON public.notifications FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY notif_insert_any ON public.notifications FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS assignments_select_all ON public.assignments;
DROP POLICY IF EXISTS assignments_insert_teacher ON public.assignments;
DROP POLICY IF EXISTS assignments_update_owner ON public.assignments;
DROP POLICY IF EXISTS assignments_delete_owner ON public.assignments;
CREATE POLICY assignments_select_all ON public.assignments FOR SELECT USING (true);
CREATE POLICY assignments_insert_teacher ON public.assignments FOR INSERT WITH CHECK (auth.uid() = teacher_id AND public.is_teacher(auth.uid()));
CREATE POLICY assignments_update_owner ON public.assignments FOR UPDATE USING (auth.uid() = teacher_id OR public.has_role(auth.uid(),'admin')) WITH CHECK (auth.uid() = teacher_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY assignments_delete_owner ON public.assignments FOR DELETE USING (auth.uid() = teacher_id OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS asub_select ON public.assignment_submissions;
DROP POLICY IF EXISTS asub_insert ON public.assignment_submissions;
DROP POLICY IF EXISTS asub_update ON public.assignment_submissions;
DROP POLICY IF EXISTS asub_delete ON public.assignment_submissions;
CREATE POLICY asub_select ON public.assignment_submissions FOR SELECT USING (true);
CREATE POLICY asub_insert ON public.assignment_submissions FOR INSERT WITH CHECK (auth.uid() = student_id);
CREATE POLICY asub_update ON public.assignment_submissions FOR UPDATE USING (auth.uid() = student_id OR public.is_teacher(auth.uid())) WITH CHECK (auth.uid() = student_id OR public.is_teacher(auth.uid()));
CREATE POLICY asub_delete ON public.assignment_submissions FOR DELETE USING (auth.uid() = student_id OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS badges_select ON public.badges;
DROP POLICY IF EXISTS badges_admin ON public.badges;
CREATE POLICY badges_select ON public.badges FOR SELECT USING (true);
CREATE POLICY badges_admin ON public.badges FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS ub_select ON public.user_badges;
DROP POLICY IF EXISTS ub_insert_self_or_teacher ON public.user_badges;
DROP POLICY IF EXISTS ub_insert ON public.user_badges;
DROP POLICY IF EXISTS ub_insert_service ON public.user_badges;
DROP POLICY IF EXISTS ub_delete ON public.user_badges;
CREATE POLICY ub_select ON public.user_badges FOR SELECT USING (true);
CREATE POLICY ub_insert_self_or_teacher ON public.user_badges FOR INSERT WITH CHECK (auth.uid() = user_id OR public.is_teacher(auth.uid()));
CREATE POLICY ub_delete ON public.user_badges FOR DELETE USING (public.is_teacher(auth.uid()) OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS events_select ON public.events;
DROP POLICY IF EXISTS events_insert_teacher ON public.events;
DROP POLICY IF EXISTS events_update_owner ON public.events;
DROP POLICY IF EXISTS events_delete_owner ON public.events;
CREATE POLICY events_select ON public.events FOR SELECT USING (true);
CREATE POLICY events_insert_teacher ON public.events FOR INSERT WITH CHECK (auth.uid() = created_by AND public.is_teacher(auth.uid()));
CREATE POLICY events_update_owner ON public.events FOR UPDATE USING (auth.uid() = created_by OR public.has_role(auth.uid(),'admin')) WITH CHECK (auth.uid() = created_by OR public.has_role(auth.uid(),'admin'));
CREATE POLICY events_delete_owner ON public.events FOR DELETE USING (auth.uid() = created_by OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS quizzes_select ON public.quizzes;
DROP POLICY IF EXISTS quizzes_insert_teacher ON public.quizzes;
DROP POLICY IF EXISTS quizzes_update_owner ON public.quizzes;
DROP POLICY IF EXISTS quizzes_delete_owner ON public.quizzes;
CREATE POLICY quizzes_select ON public.quizzes FOR SELECT USING (true);
CREATE POLICY quizzes_insert_teacher ON public.quizzes FOR INSERT WITH CHECK (auth.uid() = created_by AND public.is_teacher(auth.uid()));
CREATE POLICY quizzes_update_owner ON public.quizzes FOR UPDATE USING (auth.uid() = created_by OR public.has_role(auth.uid(),'admin')) WITH CHECK (auth.uid() = created_by OR public.has_role(auth.uid(),'admin'));
CREATE POLICY quizzes_delete_owner ON public.quizzes FOR DELETE USING (auth.uid() = created_by OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS qa_select ON public.quiz_attempts;
DROP POLICY IF EXISTS qa_insert_own ON public.quiz_attempts;
CREATE POLICY qa_select ON public.quiz_attempts FOR SELECT USING (true);
CREATE POLICY qa_insert_own ON public.quiz_attempts FOR INSERT WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS certificates_select ON public.certificates;
DROP POLICY IF EXISTS certificates_insert_teacher ON public.certificates;
DROP POLICY IF EXISTS certificates_delete ON public.certificates;
CREATE POLICY certificates_select ON public.certificates FOR SELECT USING (auth.uid() = student_id OR auth.uid() = teacher_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY certificates_insert_teacher ON public.certificates FOR INSERT WITH CHECK (auth.uid() = teacher_id AND public.is_teacher(auth.uid()));
CREATE POLICY certificates_delete ON public.certificates FOR DELETE USING (auth.uid() = teacher_id OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS reactions_select ON public.reactions;
DROP POLICY IF EXISTS reactions_insert ON public.reactions;
DROP POLICY IF EXISTS reactions_delete ON public.reactions;
CREATE POLICY reactions_select ON public.reactions FOR SELECT USING (true);
CREATE POLICY reactions_insert ON public.reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY reactions_delete ON public.reactions FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS gcst_select_all ON public.gallery_contests;
DROP POLICY IF EXISTS gcst_insert_teacher ON public.gallery_contests;
DROP POLICY IF EXISTS gcst_update_owner ON public.gallery_contests;
DROP POLICY IF EXISTS gcst_delete_owner ON public.gallery_contests;
CREATE POLICY gcst_select_all ON public.gallery_contests FOR SELECT USING (true);
CREATE POLICY gcst_insert_teacher ON public.gallery_contests FOR INSERT WITH CHECK (auth.uid() = created_by AND public.is_teacher(auth.uid()));
CREATE POLICY gcst_update_owner ON public.gallery_contests FOR UPDATE USING (auth.uid() = created_by OR public.has_role(auth.uid(),'admin')) WITH CHECK (auth.uid() = created_by OR public.has_role(auth.uid(),'admin'));
CREATE POLICY gcst_delete_owner ON public.gallery_contests FOR DELETE USING (auth.uid() = created_by OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS gce_select_all ON public.gallery_contest_entries;
DROP POLICY IF EXISTS gce_insert_own ON public.gallery_contest_entries;
DROP POLICY IF EXISTS gce_delete_own ON public.gallery_contest_entries;
CREATE POLICY gce_select_all ON public.gallery_contest_entries FOR SELECT USING (true);
CREATE POLICY gce_insert_own ON public.gallery_contest_entries FOR INSERT WITH CHECK (auth.uid() = user_id AND NOT public.is_banned(auth.uid()));
CREATE POLICY gce_delete_own ON public.gallery_contest_entries FOR DELETE USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS gcv_select_all ON public.gallery_contest_votes;
DROP POLICY IF EXISTS gcv_insert_own ON public.gallery_contest_votes;
DROP POLICY IF EXISTS gcv_delete_own ON public.gallery_contest_votes;
CREATE POLICY gcv_select_all ON public.gallery_contest_votes FOR SELECT USING (true);
CREATE POLICY gcv_insert_own ON public.gallery_contest_votes FOR INSERT WITH CHECK (auth.uid() = user_id AND NOT public.is_banned(auth.uid()));
CREATE POLICY gcv_delete_own ON public.gallery_contest_votes FOR DELETE USING (auth.uid() = user_id);

DROP POLICY IF EXISTS wt_select_all ON public.weekly_top;
CREATE POLICY wt_select_all ON public.weekly_top FOR SELECT USING (true);

-- Storage policies
DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT polname FROM pg_policy WHERE polrelid = 'storage.objects'::regclass AND polname LIKE 'lh_%' LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.polname);
  END LOOP;
END $$;

CREATE POLICY lh_chat_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'chat-images');
CREATE POLICY lh_chat_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'chat-images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY lh_chat_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'chat-images' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY lh_act_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'activity-files');
CREATE POLICY lh_act_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'activity-files' AND public.is_teacher(auth.uid()) AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY lh_act_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'activity-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY lh_gal_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'gallery-media');
CREATE POLICY lh_gal_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'gallery-media' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY lh_gal_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'gallery-media' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY lh_av_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'avatars');
CREATE POLICY lh_av_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY lh_av_update ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY lh_av_delete ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY lh_asg_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'assignment-files');
CREATE POLICY lh_asg_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'assignment-files' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY lh_dm_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'dm-images');
CREATE POLICY lh_dm_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'dm-images' AND auth.uid() IS NOT NULL);

CREATE POLICY lh_cert_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'certificates');
CREATE POLICY lh_cert_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'certificates' AND public.is_teacher(auth.uid()));

CREATE POLICY lh_cm_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'competition-media');
CREATE POLICY lh_cm_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'competition-media' AND auth.uid() IS NOT NULL);

CREATE POLICY lh_qz_read ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'quiz-images');
CREATE POLICY lh_qz_upload ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'quiz-images' AND public.is_teacher(auth.uid()));

-- Triggers
CREATE OR REPLACE FUNCTION public.auto_approve_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN NEW.status := 'approved'; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_auto_approve_activity ON public.activities;
CREATE TRIGGER trg_auto_approve_activity BEFORE INSERT ON public.activities FOR EACH ROW EXECUTE FUNCTION public.auto_approve_activity();

CREATE OR REPLACE FUNCTION public.notify_new_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'approved' THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    SELECT p.id, 'activity', 'نشاط جديد في بنك الأنشطة', NEW.title, '/activities'
    FROM public.profiles p WHERE p.id <> NEW.user_id;
    UPDATE public.profiles SET points = points + 10 WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_new_activity ON public.activities;
CREATE TRIGGER trg_notify_new_activity AFTER INSERT ON public.activities FOR EACH ROW EXECUTE FUNCTION public.notify_new_activity();

CREATE OR REPLACE FUNCTION public.award_activity_badges()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cnt INT;
BEGIN
  IF NEW.status = 'approved' THEN
    SELECT COUNT(*) INTO cnt FROM public.activities WHERE user_id = NEW.user_id AND status='approved';
    IF cnt >= 1 THEN INSERT INTO public.user_badges(user_id,badge_id) VALUES(NEW.user_id,'first_activity') ON CONFLICT DO NOTHING; END IF;
    IF cnt >= 5 THEN INSERT INTO public.user_badges(user_id,badge_id) VALUES(NEW.user_id,'five_activities') ON CONFLICT DO NOTHING; END IF;
    IF cnt >= 10 THEN INSERT INTO public.user_badges(user_id,badge_id) VALUES(NEW.user_id,'ten_activities') ON CONFLICT DO NOTHING; END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_award_activity_badges ON public.activities;
CREATE TRIGGER trg_award_activity_badges AFTER INSERT OR UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION public.award_activity_badges();

CREATE OR REPLACE FUNCTION public.notify_new_dm()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE sname TEXT;
BEGIN
  SELECT display_name INTO sname FROM public.profiles WHERE id = NEW.sender_id;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (NEW.receiver_id, 'dm', 'رسالة خاصة من ' || COALESCE(sname,'مستخدم'), left(NEW.content, 80), '/messages?with=' || NEW.sender_id::text);
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notify_dm ON public.direct_messages;
CREATE TRIGGER trg_notify_dm AFTER INSERT ON public.direct_messages FOR EACH ROW EXECUTE FUNCTION public.notify_new_dm();

CREATE OR REPLACE FUNCTION public.notify_new_certificate()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (NEW.student_id, 'certificate', 'حصلت على شهادة جديدة 🏆', NEW.title, '/profile');
  UPDATE public.profiles SET points = points + 10 WHERE id = NEW.student_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_new_certificate ON public.certificates;
CREATE TRIGGER trg_new_certificate AFTER INSERT ON public.certificates FOR EACH ROW EXECUTE FUNCTION public.notify_new_certificate();

CREATE OR REPLACE FUNCTION public.notify_new_badge()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE bname TEXT;
BEGIN
  SELECT name INTO bname FROM public.badges WHERE id = NEW.badge_id;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (NEW.user_id, 'badge', 'حصلت على شارة جديدة 🏅', COALESCE(bname, NEW.badge_id), '/badges');
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_new_badge ON public.user_badges;
CREATE TRIGGER trg_new_badge AFTER INSERT ON public.user_badges FOR EACH ROW EXECUTE FUNCTION public.notify_new_badge();

-- Seed badges with audience (student / teacher)
INSERT INTO public.badges (id, name, description, icon, color, audience) VALUES
  ('first_activity','أول نشاط','رفعت أول نشاط معتمد','🌱','emerald','student'),
  ('five_activities','خمسة أنشطة','رفعت 5 أنشطة','⭐','amber','student'),
  ('ten_activities','عشرة أنشطة','رفعت 10 أنشطة','🏆','rose','student'),
  ('competition_winner','بطل المسابقات','إجابة صحيحة في مسابقة','🥇','violet','student'),
  ('top_chatter','نشيط في المجتمع','مشارك فعّال في الحوار','💬','cyan','student'),
  ('excellence','شارة التميز','للطالب المتميز','🌟','amber','student'),
  ('distinction','شارة التفوق','للطالب المتفوق دراسيّاً','🏆','violet','student'),
  ('participation','شارة المشاركة','للطالب الفعّال','🙋','cyan','student'),
  ('creativity','شارة الإبداع','للطالب المبدع','🎨','rose','student'),
  ('perseverance','شارة المثابرة','للطالب المثابر','💪','emerald','student'),
  ('leadership','شارة القيادة','للطالب القائد','👑','amber','student'),
  ('helpful','شارة المساعد','للطالب المساعد لزملائه','🤝','cyan','student'),
  ('honor_student','طالب الأسبوع','الأعلى نقاطاً هذا الأسبوع','🎖️','violet','student'),
  ('student_of_week','طالب الأسبوع','الأعلى نقاطاً هذا الأسبوع','🌟','amber','student'),
  ('teacher_excellence','معلم متميز','للمعلم المتميز','🏅','amber','teacher'),
  ('teacher_innovation','معلم مبدع','للمعلم المبدع في طرح الأنشطة','💡','violet','teacher'),
  ('teacher_dedication','معلم مخلص','للمعلم المخلص في عمله','💎','cyan','teacher'),
  ('teacher_of_week','معلم الأسبوع','الأعلى نشاطاً هذا الأسبوع','🌠','rose','teacher')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  icon = EXCLUDED.icon, color = EXCLUDED.color, audience = EXCLUDED.audience;

DO $$ BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.messages; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.competition_submissions; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;
ALTER TABLE public.messages REPLICA IDENTITY FULL;