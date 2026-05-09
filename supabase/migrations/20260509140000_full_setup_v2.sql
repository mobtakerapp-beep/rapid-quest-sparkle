-- ==================================================
-- جميع الترحيلات مجمّعة — شغّليه دفعة واحدة في SQL Editor
-- ==================================================

-- ========== 20260508081044_94680c8d-ea16-4b84-a6cb-eb2b41f3753c.sql ==========
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typnamespace = 'public'::regnamespace AND typname = 'app_role') THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'user');
  END IF;
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
  theme TEXT NOT NULL DEFAULT 'default'
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'profiles_role_type_check') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_type_check CHECK (role_type IN ('teacher','student','parent','supervisor'));
  END IF;
END $$;

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
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.is_banned(_user_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE((SELECT is_banned FROM public.profiles WHERE id = _user_id), false)
$$;

CREATE OR REPLACE FUNCTION public.is_teacher(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = _user_id AND role_type IN ('teacher','supervisor'))
      OR public.has_role(_user_id, 'admin'::public.app_role)
$$;

CREATE OR REPLACE FUNCTION public.claim_admin_role(_code TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF _code <> 'MOSHRF-2026' THEN RETURN false; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_teacher_role(_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF _code <> 'TEACHER-2026' THEN RETURN false; END IF;
  INSERT INTO public.profiles (id, role_type)
  VALUES (_uid, 'teacher')
  ON CONFLICT (id) DO UPDATE SET role_type = 'teacher';
  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  ) ON CONFLICT (id) DO UPDATE SET
    display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name),
    avatar_url = COALESCE(public.profiles.avatar_url, EXCLUDED.avatar_url);
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user') ON CONFLICT DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  reason TEXT NOT NULL,
  content TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.check_message_profanity()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  bad_words TEXT[] := ARRAY['كلب','حمار','غبي','احمق','أحمق','لعنة','تبا','تباً','قحبة','شرموط','شرموطة','زبي','كس ','نيك','منيك','عرص','خول','زانية','حقير','وسخ','منحط','عاهرة','لقيط'];
  w TEXT;
  lower_content TEXT;
BEGIN
  IF NEW.content IS NULL OR length(trim(NEW.content)) = 0 THEN RETURN NEW; END IF;
  lower_content := lower(NEW.content);
  FOREACH w IN ARRAY bad_words LOOP
    IF lower_content LIKE '%'||lower(w)||'%' THEN
      UPDATE public.profiles SET warning_count = warning_count + 1 WHERE id = NEW.user_id;
      INSERT INTO public.reports (user_id, reason, content) VALUES (NEW.user_id, 'كلمة غير لائقة: '||w, NEW.content);
      RAISE EXCEPTION 'PROFANITY_BLOCKED: تم حظر هذه الرسالة لاحتوائها كلمات غير لائقة';
    END IF;
  END LOOP;
  RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS messages_profanity_check ON public.messages;
CREATE TRIGGER messages_profanity_check BEFORE INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.check_message_profanity();

CREATE TABLE IF NOT EXISTS public.activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subject text NOT NULL DEFAULT 'عام',
  title text NOT NULL,
  description text,
  file_url text NOT NULL,
  file_type text NOT NULL,
  file_name text,
  created_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'approved'
);
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.auto_approve_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.status := 'approved';
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_auto_approve_activity ON public.activities;
CREATE TRIGGER trg_auto_approve_activity BEFORE INSERT ON public.activities FOR EACH ROW EXECUTE FUNCTION public.auto_approve_activity();

CREATE TABLE IF NOT EXISTS public.activity_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id UUID NOT NULL,
  user_id UUID NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.activity_comments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.gallery_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  item_id uuid NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.gallery_comments ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS gallery_comments_item_idx ON public.gallery_comments(item_id, created_at);

CREATE TABLE IF NOT EXISTS public.direct_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL,
  receiver_id UUID NOT NULL,
  content TEXT NOT NULL,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.direct_messages ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_dm_pair ON public.direct_messages(sender_id, receiver_id, created_at);

CREATE TABLE IF NOT EXISTS public.competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  question TEXT NOT NULL,
  correct_answer TEXT,
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
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  time_taken_seconds INTEGER NOT NULL,
  is_correct BOOLEAN NOT NULL DEFAULT false,
  teacher_approved BOOLEAN NOT NULL DEFAULT false,
  approved_by UUID,
  UNIQUE (competition_id, user_id)
);
ALTER TABLE public.competition_submissions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT,
  link TEXT,
  is_read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_notif_user ON public.notifications(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id UUID NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  subject TEXT NOT NULL DEFAULT 'عام',
  due_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.assignments ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.assignment_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assignment_id UUID NOT NULL REFERENCES public.assignments(id) ON DELETE CASCADE,
  student_id UUID NOT NULL,
  content TEXT,
  file_url TEXT,
  grade INTEGER,
  feedback TEXT,
  graded_by UUID,
  graded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.assignment_submissions ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.badges (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT NOT NULL DEFAULT '🏅',
  color TEXT NOT NULL DEFAULT 'amber'
);
ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.user_badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  badge_id TEXT NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, badge_id)
);
ALTER TABLE public.user_badges ENABLE ROW LEVEL SECURITY;

INSERT INTO public.badges (id,name,description,icon,color) VALUES
  ('first_activity','أول نشاط','رفعت أول نشاط لك 🎉','🌱','emerald'),
  ('five_activities','5 أنشطة','رفعت 5 أنشطة','⭐','amber'),
  ('ten_activities','10 أنشطة','رفعت 10 أنشطة، رائع!','🏆','rose'),
  ('competition_winner','بطل المسابقات','أجبت بشكل صحيح في مسابقة','🥇','violet'),
  ('top_chatter','نشيط في المجتمع','شاركت بـ 20 رسالة في الشات','💬','cyan')
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ,
  type TEXT NOT NULL DEFAULT 'general',
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.quizzes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT 'عام',
  questions JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_by UUID NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.quizzes ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.quiz_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quiz_id UUID NOT NULL REFERENCES public.quizzes(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  total INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.quiz_attempts ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  INSERT INTO storage.buckets (id, name, public) VALUES ('chat-images', 'chat-images', true) ON CONFLICT (id) DO NOTHING;
  INSERT INTO storage.buckets (id, name, public) VALUES ('activity-files', 'activity-files', true) ON CONFLICT (id) DO NOTHING;
  INSERT INTO storage.buckets (id, name, public) VALUES ('gallery-media', 'gallery-media', true) ON CONFLICT (id) DO NOTHING;
  INSERT INTO storage.buckets (id, name, public) VALUES ('avatars', 'avatars', true) ON CONFLICT (id) DO NOTHING;
  INSERT INTO storage.buckets (id, name, public) VALUES ('assignment-files', 'assignment-files', true) ON CONFLICT (id) DO NOTHING;
END $$;

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
CREATE POLICY user_roles_admin_all ON public.user_roles FOR ALL USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS messages_select_all ON public.messages;
DROP POLICY IF EXISTS messages_insert_own ON public.messages;
DROP POLICY IF EXISTS messages_delete_own ON public.messages;
DROP POLICY IF EXISTS messages_admin_delete ON public.messages;
CREATE POLICY messages_select_all ON public.messages FOR SELECT USING (true);
CREATE POLICY messages_insert_own ON public.messages FOR INSERT WITH CHECK (auth.uid() = user_id AND NOT public.is_banned(auth.uid()));
CREATE POLICY messages_delete_own ON public.messages FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY messages_admin_delete ON public.messages FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS reports_admin_all ON public.reports;
DROP POLICY IF EXISTS reports_insert_self ON public.reports;
CREATE POLICY reports_admin_all ON public.reports FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY reports_insert_self ON public.reports FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS activities_select_all ON public.activities;
DROP POLICY IF EXISTS activities_select_visible ON public.activities;
DROP POLICY IF EXISTS activities_insert_teacher ON public.activities;
DROP POLICY IF EXISTS activities_insert_any_auth ON public.activities;
DROP POLICY IF EXISTS activities_delete_own ON public.activities;
DROP POLICY IF EXISTS activities_admin_delete ON public.activities;
DROP POLICY IF EXISTS activities_admin_update ON public.activities;
CREATE POLICY activities_select_visible ON public.activities FOR SELECT USING (status = 'approved' OR auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'));
CREATE POLICY activities_insert_teacher ON public.activities FOR INSERT WITH CHECK (auth.uid() = user_id AND public.is_teacher(auth.uid()) AND NOT public.is_banned(auth.uid()));
CREATE POLICY activities_delete_own ON public.activities FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY activities_admin_delete ON public.activities FOR DELETE USING (public.has_role(auth.uid(), 'admin'));
CREATE POLICY activities_admin_update ON public.activities FOR UPDATE USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS ac_select_all ON public.activity_comments;
DROP POLICY IF EXISTS ac_insert_own ON public.activity_comments;
DROP POLICY IF EXISTS ac_delete_own ON public.activity_comments;
DROP POLICY IF EXISTS ac_admin_delete ON public.activity_comments;
CREATE POLICY ac_select_all ON public.activity_comments FOR SELECT USING (true);
CREATE POLICY ac_insert_own ON public.activity_comments FOR INSERT WITH CHECK (auth.uid() = user_id AND NOT public.is_banned(auth.uid()));
CREATE POLICY ac_delete_own ON public.activity_comments FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY ac_admin_delete ON public.activity_comments FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS gc_select_all ON public.gallery_comments;
DROP POLICY IF EXISTS gc_insert_own ON public.gallery_comments;
DROP POLICY IF EXISTS gc_delete_own ON public.gallery_comments;
DROP POLICY IF EXISTS gc_admin_delete ON public.gallery_comments;
CREATE POLICY gc_select_all ON public.gallery_comments FOR SELECT USING (true);
CREATE POLICY gc_insert_own ON public.gallery_comments FOR INSERT WITH CHECK (auth.uid() = user_id AND NOT public.is_banned(auth.uid()));
CREATE POLICY gc_delete_own ON public.gallery_comments FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY gc_admin_delete ON public.gallery_comments FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS dm_select_own ON public.direct_messages;
DROP POLICY IF EXISTS dm_insert_own ON public.direct_messages;
DROP POLICY IF EXISTS dm_update_receiver ON public.direct_messages;
DROP POLICY IF EXISTS dm_delete_own ON public.direct_messages;
CREATE POLICY dm_select_own ON public.direct_messages FOR SELECT USING (auth.uid() = sender_id OR auth.uid() = receiver_id);
CREATE POLICY dm_insert_own ON public.direct_messages FOR INSERT WITH CHECK (auth.uid() = sender_id AND NOT public.is_banned(auth.uid()));
CREATE POLICY dm_update_receiver ON public.direct_messages FOR UPDATE USING (auth.uid() = receiver_id);
CREATE POLICY dm_delete_own ON public.direct_messages FOR DELETE USING (auth.uid() = sender_id OR public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS comp_select_all ON public.competitions;
DROP POLICY IF EXISTS comp_insert_admin ON public.competitions;
DROP POLICY IF EXISTS comp_insert_teacher ON public.competitions;
DROP POLICY IF EXISTS comp_update_admin ON public.competitions;
DROP POLICY IF EXISTS comp_delete_admin ON public.competitions;
CREATE POLICY comp_select_all ON public.competitions FOR SELECT USING (true);
CREATE POLICY comp_insert_teacher ON public.competitions FOR INSERT WITH CHECK (auth.uid() = created_by AND public.is_teacher(auth.uid()));
CREATE POLICY comp_update_admin ON public.competitions FOR UPDATE USING (public.has_role(auth.uid(), 'admin')) WITH CHECK (public.has_role(auth.uid(), 'admin'));
CREATE POLICY comp_delete_admin ON public.competitions FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS cs_select_all ON public.competition_submissions;
DROP POLICY IF EXISTS cs_insert_own ON public.competition_submissions;
DROP POLICY IF EXISTS cs_admin_delete ON public.competition_submissions;
DROP POLICY IF EXISTS cs_update_teacher ON public.competition_submissions;
CREATE POLICY cs_select_all ON public.competition_submissions FOR SELECT USING (true);
CREATE POLICY cs_insert_own ON public.competition_submissions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY cs_update_teacher ON public.competition_submissions FOR UPDATE USING (public.is_teacher(auth.uid())) WITH CHECK (public.is_teacher(auth.uid()));
CREATE POLICY cs_admin_delete ON public.competition_submissions FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS notif_select_own ON public.notifications;
DROP POLICY IF EXISTS notif_update_own ON public.notifications;
DROP POLICY IF EXISTS notif_delete_own ON public.notifications;
DROP POLICY IF EXISTS notif_insert_any ON public.notifications;
CREATE POLICY notif_select_own ON public.notifications FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY notif_update_own ON public.notifications FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY notif_delete_own ON public.notifications FOR DELETE USING (auth.uid() = user_id);
CREATE POLICY notif_insert_service ON public.notifications FOR INSERT WITH CHECK (auth.uid() IS NOT NULL OR current_setting('role', true) = 'service_role');

DROP POLICY IF EXISTS assignments_select_all ON public.assignments;
DROP POLICY IF EXISTS assignments_insert_teacher ON public.assignments;
DROP POLICY IF EXISTS assignments_update_owner ON public.assignments;
DROP POLICY IF EXISTS assignments_delete_owner ON public.assignments;
CREATE POLICY assignments_select_all ON public.assignments FOR SELECT USING (true);
CREATE POLICY assignments_insert_teacher ON public.assignments FOR INSERT WITH CHECK (auth.uid() = teacher_id AND public.is_teacher(auth.uid()));
CREATE POLICY assignments_update_owner ON public.assignments FOR UPDATE USING (auth.uid() = teacher_id OR public.has_role(auth.uid(),'admin')) WITH CHECK (auth.uid() = teacher_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY assignments_delete_owner ON public.assignments FOR DELETE USING (auth.uid() = teacher_id OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS asub_select ON public.assignment_submissions;
DROP POLICY IF EXISTS asub_insert_student ON public.assignment_submissions;
DROP POLICY IF EXISTS asub_update_teacher ON public.assignment_submissions;
DROP POLICY IF EXISTS asub_delete ON public.assignment_submissions;
CREATE POLICY asub_select ON public.assignment_submissions FOR SELECT USING (auth.uid() = student_id OR public.is_teacher(auth.uid()));
CREATE POLICY asub_insert_student ON public.assignment_submissions FOR INSERT WITH CHECK (auth.uid() = student_id AND NOT public.is_banned(auth.uid()));
CREATE POLICY asub_update_teacher ON public.assignment_submissions FOR UPDATE USING (public.is_teacher(auth.uid())) WITH CHECK (public.is_teacher(auth.uid()));
CREATE POLICY asub_delete ON public.assignment_submissions FOR DELETE USING (auth.uid() = student_id OR public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS badges_select ON public.badges;
DROP POLICY IF EXISTS badges_admin ON public.badges;
CREATE POLICY badges_select ON public.badges FOR SELECT USING (true);
CREATE POLICY badges_admin ON public.badges FOR ALL USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

DROP POLICY IF EXISTS ub_select ON public.user_badges;
DROP POLICY IF EXISTS ub_insert ON public.user_badges;
CREATE POLICY ub_select ON public.user_badges FOR SELECT USING (true);
CREATE POLICY ub_insert_service ON public.user_badges FOR INSERT WITH CHECK (auth.uid() IS NOT NULL OR current_setting('role', true) = 'service_role');

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

DROP POLICY IF EXISTS "chat_images_public_read" ON storage.objects;
DROP POLICY IF EXISTS "chat_images_user_upload" ON storage.objects;
DROP POLICY IF EXISTS "chat_images_user_delete" ON storage.objects;
DROP POLICY IF EXISTS "activity_files_public_read" ON storage.objects;
DROP POLICY IF EXISTS "activity_files_teacher_insert" ON storage.objects;
DROP POLICY IF EXISTS "activity_files_owner_delete" ON storage.objects;
DROP POLICY IF EXISTS "gallery_media_public_read" ON storage.objects;
DROP POLICY IF EXISTS "gallery_media_user_insert" ON storage.objects;
DROP POLICY IF EXISTS "gallery_media_owner_delete" ON storage.objects;
DROP POLICY IF EXISTS "avatars_read" ON storage.objects;
DROP POLICY IF EXISTS "avatars_upload_own" ON storage.objects;
DROP POLICY IF EXISTS "avatars_update_own" ON storage.objects;
DROP POLICY IF EXISTS "avatars_delete_own" ON storage.objects;
DROP POLICY IF EXISTS "assignment_files_public_read" ON storage.objects;
DROP POLICY IF EXISTS "assignment_files_user_insert" ON storage.objects;
DROP POLICY IF EXISTS "assignment_files_owner_delete" ON storage.objects;

CREATE POLICY "chat_images_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'chat-images');
CREATE POLICY "chat_images_user_upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'chat-images' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "chat_images_user_delete" ON storage.objects FOR DELETE USING (bucket_id = 'chat-images' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin')));
CREATE POLICY "activity_files_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'activity-files');
CREATE POLICY "activity_files_teacher_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'activity-files' AND public.is_teacher(auth.uid()) AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "activity_files_owner_delete" ON storage.objects FOR DELETE USING (bucket_id = 'activity-files' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin')));
CREATE POLICY "gallery_media_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'gallery-media');
CREATE POLICY "gallery_media_user_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'gallery-media' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "gallery_media_owner_delete" ON storage.objects FOR DELETE USING (bucket_id = 'gallery-media' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin')));
CREATE POLICY "avatars_read" ON storage.objects FOR SELECT USING (bucket_id = 'avatars');
CREATE POLICY "avatars_upload_own" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "avatars_update_own" ON storage.objects FOR UPDATE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "avatars_delete_own" ON storage.objects FOR DELETE USING (bucket_id = 'avatars' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "assignment_files_public_read" ON storage.objects FOR SELECT USING (bucket_id = 'assignment-files');
CREATE POLICY "assignment_files_user_insert" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'assignment-files' AND auth.uid()::text = (storage.foldername(name))[1]);
CREATE POLICY "assignment_files_owner_delete" ON storage.objects FOR DELETE USING (bucket_id = 'assignment-files' AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin')));

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
END; $$;
DROP TRIGGER IF EXISTS trg_notify_new_activity ON public.activities;
CREATE TRIGGER trg_notify_new_activity AFTER INSERT ON public.activities FOR EACH ROW EXECUTE FUNCTION public.notify_new_activity();

CREATE OR REPLACE FUNCTION public.notify_activity_approved()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.status = 'approved' AND OLD.status <> 'approved' THEN
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (NEW.user_id, 'approval', 'تم اعتماد نشاطك ✅', NEW.title, '/activities');
    UPDATE public.profiles SET points = points + 5 WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_notify_approved ON public.activities;
CREATE TRIGGER trg_notify_approved AFTER UPDATE ON public.activities FOR EACH ROW EXECUTE FUNCTION public.notify_activity_approved();

CREATE OR REPLACE FUNCTION public.award_activity_badges()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cnt INT;
BEGIN
  IF NEW.status = 'approved' AND (TG_OP = 'INSERT' OR OLD.status IS NULL OR OLD.status <> 'approved') THEN
    SELECT COUNT(*) INTO cnt FROM public.activities WHERE user_id = NEW.user_id AND status='approved';
    IF cnt >= 1 THEN INSERT INTO public.user_badges(user_id,badge_id) VALUES(NEW.user_id,'first_activity') ON CONFLICT DO NOTHING; END IF;
    IF cnt >= 5 THEN INSERT INTO public.user_badges(user_id,badge_id) VALUES(NEW.user_id,'five_activities') ON CONFLICT DO NOTHING; END IF;
    IF cnt >= 10 THEN INSERT INTO public.user_badges(user_id,badge_id) VALUES(NEW.user_id,'ten_activities') ON CONFLICT DO NOTHING; END IF;
  END IF;
  RETURN NEW;
END;$$;
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
END; $$;
DROP TRIGGER IF EXISTS trg_notify_dm ON public.direct_messages;
CREATE TRIGGER trg_notify_dm AFTER INSERT ON public.direct_messages FOR EACH ROW EXECUTE FUNCTION public.notify_new_dm();

CREATE OR REPLACE FUNCTION public.award_point()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles SET points = points + 1 WHERE id = NEW.user_id;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_award_msg ON public.messages;
CREATE TRIGGER trg_award_msg AFTER INSERT ON public.messages FOR EACH ROW EXECUTE FUNCTION public.award_point();
DROP TRIGGER IF EXISTS trg_award_gc ON public.gallery_comments;
CREATE TRIGGER trg_award_gc AFTER INSERT ON public.gallery_comments FOR EACH ROW EXECUTE FUNCTION public.award_point();
DROP TRIGGER IF EXISTS trg_award_ac ON public.activity_comments;
CREATE TRIGGER trg_award_ac AFTER INSERT ON public.activity_comments FOR EACH ROW EXECUTE FUNCTION public.award_point();

CREATE OR REPLACE FUNCTION public.award_competition_points()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles SET points = points + CASE WHEN NEW.is_correct THEN 20 ELSE 5 END WHERE id = NEW.user_id;
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_award_comp ON public.competition_submissions;
CREATE TRIGGER trg_award_comp AFTER INSERT ON public.competition_submissions FOR EACH ROW EXECUTE FUNCTION public.award_competition_points();

CREATE OR REPLACE FUNCTION public.award_competition_badge()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  IF NEW.is_correct = true AND (OLD.is_correct IS DISTINCT FROM NEW.is_correct) THEN
    INSERT INTO public.user_badges(user_id,badge_id) VALUES(NEW.user_id,'competition_winner') ON CONFLICT DO NOTHING;
    UPDATE public.profiles SET points = points + 15 WHERE id = NEW.user_id;
    INSERT INTO public.notifications(user_id,type,title,body,link)
      VALUES(NEW.user_id,'competition','إجابة صحيحة! 🎉','تم اعتماد إجابتك في المسابقة','/competitions');
  END IF;
  RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS trg_award_competition_badge ON public.competition_submissions;
CREATE TRIGGER trg_award_competition_badge AFTER UPDATE ON public.competition_submissions FOR EACH ROW EXECUTE FUNCTION public.award_competition_badge();

CREATE OR REPLACE FUNCTION public.award_quiz_points()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  UPDATE public.profiles SET points = points + GREATEST(NEW.score * 2, 1) WHERE id = NEW.user_id;
  RETURN NEW;
END;$$;
DROP TRIGGER IF EXISTS trg_award_quiz_points ON public.quiz_attempts;
CREATE TRIGGER trg_award_quiz_points AFTER INSERT ON public.quiz_attempts FOR EACH ROW EXECUTE FUNCTION public.award_quiz_points();

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.messages; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.profiles; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.reports; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages; EXCEPTION WHEN duplicate_object THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.competition_submissions; EXCEPTION WHEN duplicate_object THEN NULL; END;
END $$;

ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.profiles REPLICA IDENTITY FULL;

-- ========== 20260508081133_52eac97a-c063-4e5e-bd85-aa773a91c043.sql ==========
REVOKE EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_banned(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_teacher(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_admin_role(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_teacher_role(TEXT) FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_message_profanity() FROM anon;
REVOKE EXECUTE ON FUNCTION public.auto_approve_activity() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_new_activity() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_activity_approved() FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_activity_badges() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_new_dm() FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_point() FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_competition_points() FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_competition_badge() FROM anon;
REVOKE EXECUTE ON FUNCTION public.award_quiz_points() FROM anon;

GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_banned(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_teacher(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_admin_role(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_teacher_role(TEXT) TO authenticated;

DROP POLICY IF EXISTS "chat_images_public_read" ON storage.objects;
DROP POLICY IF EXISTS "activity_files_public_read" ON storage.objects;
DROP POLICY IF EXISTS "gallery_media_public_read" ON storage.objects;
DROP POLICY IF EXISTS "avatars_read" ON storage.objects;
DROP POLICY IF EXISTS "assignment_files_public_read" ON storage.objects;

CREATE POLICY "chat_images_authenticated_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'chat-images');
CREATE POLICY "activity_files_authenticated_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'activity-files');
CREATE POLICY "gallery_media_authenticated_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'gallery-media');
CREATE POLICY "avatars_authenticated_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'avatars');
CREATE POLICY "assignment_files_authenticated_read" ON storage.objects FOR SELECT TO authenticated USING (bucket_id = 'assignment-files');

-- ========== 20260508081440_d0d0e9b9-25bc-481f-8c50-a54e5524f1bb.sql ==========
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'teacher';
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'supervisor';

-- ========== 20260508081521_ee168f00-2681-463d-9255-3f391b0bb526.sql ==========
CREATE OR REPLACE FUNCTION public.is_teacher(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
      OR public.has_role(_user_id, 'teacher'::public.app_role)
      OR public.has_role(_user_id, 'supervisor'::public.app_role)
$$;

CREATE OR REPLACE FUNCTION public.claim_teacher_role(_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF _code <> 'TEACHER-2026' THEN RETURN false; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'teacher'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  UPDATE public.profiles SET role_type = 'teacher' WHERE id = _uid;
  RETURN true;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.is_teacher(UUID) FROM anon;
REVOKE EXECUTE ON FUNCTION public.claim_teacher_role(TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_teacher(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_teacher_role(TEXT) TO authenticated;

-- ========== 20260508084848_9301519d-501c-407b-a0a6-d3b0a66c163a.sql ==========

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS teacher_id uuid,
  ADD COLUMN IF NOT EXISTS class_code text UNIQUE;

CREATE INDEX IF NOT EXISTS idx_profiles_teacher_id ON public.profiles(teacher_id);

-- Helper to generate a short unique class code
CREATE OR REPLACE FUNCTION public.generate_class_code()
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  c text;
  exists_count int;
BEGIN
  LOOP
    c := upper(substr(md5(random()::text || clock_timestamp()::text), 1, 6));
    SELECT count(*) INTO exists_count FROM public.profiles WHERE class_code = c;
    EXIT WHEN exists_count = 0;
  END LOOP;
  RETURN c;
END; $$;

-- Update claim_teacher_role to also create a class code
CREATE OR REPLACE FUNCTION public.claim_teacher_role(_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid UUID := auth.uid();
  _existing text;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF _code <> 'TEACHER-2026' THEN RETURN false; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'teacher'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  SELECT class_code INTO _existing FROM public.profiles WHERE id = _uid;
  IF _existing IS NULL THEN
    UPDATE public.profiles SET role_type = 'teacher', class_code = public.generate_class_code() WHERE id = _uid;
  ELSE
    UPDATE public.profiles SET role_type = 'teacher' WHERE id = _uid;
  END IF;
  RETURN true;
END; $$;

-- Student joins a teacher by entering the teacher's class code
CREATE OR REPLACE FUNCTION public.join_teacher_by_code(_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid UUID := auth.uid();
  _tid UUID;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  SELECT id INTO _tid FROM public.profiles
    WHERE class_code = upper(trim(_code)) AND role_type = 'teacher' LIMIT 1;
  IF _tid IS NULL THEN RETURN false; END IF;
  UPDATE public.profiles SET teacher_id = _tid WHERE id = _uid;
  RETURN true;
END; $$;

-- Teacher adds student to class by email
CREATE OR REPLACE FUNCTION public.add_student_by_email(_email text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid UUID := auth.uid();
  _sid UUID;
BEGIN
  IF _uid IS NULL OR NOT public.is_teacher(_uid) THEN RETURN false; END IF;
  SELECT id INTO _sid FROM auth.users WHERE lower(email) = lower(trim(_email)) LIMIT 1;
  IF _sid IS NULL THEN RETURN false; END IF;
  UPDATE public.profiles SET teacher_id = _uid WHERE id = _sid;
  INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (_sid, 'system', 'تم إضافتك إلى فصل المعلم', 'قام معلم بإضافتك إلى قائمة طلابه', '/profile');
  RETURN true;
END; $$;


-- ========== 20260508103203_dbbeadd2-c266-4a6c-af56-541340646310.sql ==========
CREATE OR REPLACE FUNCTION public.claim_admin_role(_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF _code <> 'WUSTA-A-2026' THEN RETURN false; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  RETURN true;
END;
$function$;

CREATE OR REPLACE FUNCTION public.claim_teacher_role(_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid UUID := auth.uid();
  _existing text;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF _code <> 'WUSTA-T-2026' THEN RETURN false; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'teacher'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  SELECT class_code INTO _existing FROM public.profiles WHERE id = _uid;
  IF _existing IS NULL THEN
    UPDATE public.profiles SET role_type = 'teacher', class_code = public.generate_class_code() WHERE id = _uid;
  ELSE
    UPDATE public.profiles SET role_type = 'teacher' WHERE id = _uid;
  END IF;
  RETURN true;
END; $function$;

-- ========== 20260508105629_6f10f126-2dd9-4fb1-a796-6aed3b68c729.sql ==========
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS country text DEFAULT 'سلطنة عُمان', ADD COLUMN IF NOT EXISTS school text;

-- ========== 20260508110357_8e5898e7-e6d3-4421-b931-9a3d3625cf95.sql ==========
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS gender text;

-- ========== 20260508112357_01d0767c-ebea-4705-b6e3-355d836389fd.sql ==========

-- 1) DM image attachments
ALTER TABLE public.direct_messages ADD COLUMN IF NOT EXISTS image_url text;

-- 2) Certificates
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

CREATE POLICY certificates_select ON public.certificates FOR SELECT USING (
  auth.uid() = student_id OR auth.uid() = teacher_id OR public.has_role(auth.uid(), 'admin'::public.app_role)
);
CREATE POLICY certificates_insert_teacher ON public.certificates FOR INSERT WITH CHECK (
  auth.uid() = teacher_id AND public.is_teacher(auth.uid())
);
CREATE POLICY certificates_delete ON public.certificates FOR DELETE USING (
  auth.uid() = teacher_id OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE OR REPLACE FUNCTION public.notify_new_certificate()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (NEW.student_id, 'certificate', 'حصلت على شهادة جديدة 🏆', NEW.title, '/profile');
  UPDATE public.profiles SET points = points + 10 WHERE id = NEW.student_id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_new_certificate ON public.certificates;
CREATE TRIGGER trg_new_certificate AFTER INSERT ON public.certificates
FOR EACH ROW EXECUTE FUNCTION public.notify_new_certificate();

-- 3) Competition comments
CREATE TABLE IF NOT EXISTS public.competition_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.competition_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY cc_select ON public.competition_comments FOR SELECT USING (true);
CREATE POLICY cc_insert ON public.competition_comments FOR INSERT WITH CHECK (auth.uid() = user_id AND NOT public.is_banned(auth.uid()));
CREATE POLICY cc_delete ON public.competition_comments FOR DELETE USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4) Reactions (generic)
CREATE TABLE IF NOT EXISTS public.reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL, -- 'activity' | 'competition' | 'gallery'
  target_id uuid NOT NULL,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_type, target_id, user_id, emoji)
);
ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY reactions_select ON public.reactions FOR SELECT USING (true);
CREATE POLICY reactions_insert ON public.reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY reactions_delete ON public.reactions FOR DELETE USING (auth.uid() = user_id);

-- 5) Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('dm-images', 'dm-images', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('certificates', 'certificates', true) ON CONFLICT DO NOTHING;

CREATE POLICY "dm-images public read" ON storage.objects FOR SELECT USING (bucket_id = 'dm-images');
CREATE POLICY "dm-images authed upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'dm-images' AND auth.uid() IS NOT NULL);
CREATE POLICY "certs public read" ON storage.objects FOR SELECT USING (bucket_id = 'certificates');
CREATE POLICY "certs teacher upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'certificates' AND public.is_teacher(auth.uid()));


-- ========== 20260508114351_f1d22b3c-7392-439f-8595-e7c20566a9e7.sql ==========
-- Ensure default badges used by triggers exist before inserting user_badges
INSERT INTO public.badges (id, name, description, icon, color) VALUES
  ('first_activity', 'أول نشاط', 'تم رفع أول نشاط معتمد', '🌟', 'blue'),
  ('five_activities', 'خمسة أنشطة', 'تم رفع خمسة أنشطة معتمدة', '🚀', 'emerald'),
  ('ten_activities', 'عشرة أنشطة', 'تم رفع عشرة أنشطة معتمدة', '🏆', 'amber'),
  ('competition_winner', 'فائز في المسابقة', 'تم اعتماد إجابة صحيحة في مسابقة', '👑', 'yellow')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color;

-- Give existing activated teachers a class code if missing
UPDATE public.profiles p
SET class_code = public.generate_class_code()
WHERE p.class_code IS NULL
  AND (
    p.role_type = 'teacher'
    OR public.has_role(p.id, 'teacher'::public.app_role)
    OR public.has_role(p.id, 'supervisor'::public.app_role)
    OR public.has_role(p.id, 'admin'::public.app_role)
  );

-- Keep teacher code generated automatically whenever a profile becomes teacher/supervisor
CREATE OR REPLACE FUNCTION public.ensure_teacher_class_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.class_code IS NULL AND NEW.role_type IN ('teacher', 'supervisor') THEN
    NEW.class_code := public.generate_class_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_teacher_class_code ON public.profiles;
CREATE TRIGGER trg_ensure_teacher_class_code
BEFORE INSERT OR UPDATE OF role_type, class_code ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.ensure_teacher_class_code();

-- Make is_teacher depend on secure role claims, not editable profile text alone
CREATE OR REPLACE FUNCTION public.is_teacher(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
      OR public.has_role(_user_id, 'teacher'::public.app_role)
      OR public.has_role(_user_id, 'supervisor'::public.app_role)
$$;

-- Update teacher role claim to always create a class code
CREATE OR REPLACE FUNCTION public.claim_teacher_role(_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid UUID := auth.uid();
  _existing text;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF _code <> 'WUSTA-T-2026' THEN RETURN false; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'teacher'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  SELECT class_code INTO _existing FROM public.profiles WHERE id = _uid;
  UPDATE public.profiles
  SET role_type = 'teacher',
      class_code = COALESCE(_existing, public.generate_class_code())
  WHERE id = _uid;
  RETURN true;
END;
$$;

-- Keep supervisor/admin role_type aligned when special codes are used
CREATE OR REPLACE FUNCTION public.claim_admin_role(_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF _code <> 'WUSTA-A-2026' THEN RETURN false; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  UPDATE public.profiles
  SET role_type = COALESCE(role_type, 'supervisor'),
      class_code = COALESCE(class_code, public.generate_class_code())
  WHERE id = _uid;
  RETURN true;
END;
$$;

-- ========== 20260508114559_88eb7690-a804-493d-bacd-5bda19ca3f1e.sql ==========
CREATE OR REPLACE FUNCTION public.protect_profile_role_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.role_type = 'teacher' AND NOT (
    public.has_role(NEW.id, 'teacher'::public.app_role)
    OR public.has_role(NEW.id, 'admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'ROLE_CODE_REQUIRED: يجب إدخال كود المعلم أولاً';
  END IF;

  IF NEW.role_type = 'supervisor' AND NOT (
    public.has_role(NEW.id, 'supervisor'::public.app_role)
    OR public.has_role(NEW.id, 'admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'ROLE_CODE_REQUIRED: يجب إدخال كود المشرف أولاً';
  END IF;

  IF NEW.role_type IN ('teacher', 'supervisor') AND NEW.class_code IS NULL THEN
    NEW.class_code := public.generate_class_code();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_role_type ON public.profiles;
CREATE TRIGGER trg_protect_profile_role_type
BEFORE INSERT OR UPDATE OF role_type, class_code ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_role_type();

-- ========== 20260508115825_dae43b8e-f2c5-4a5f-b138-27fd661ec39f.sql ==========

INSERT INTO public.badges (id, name, description, icon, color) VALUES
  ('excellence', 'شارة التميز', 'تمنح للطالب المتميز في أداءه', '🌟', 'amber'),
  ('distinction', 'شارة التفوق', 'تمنح للطالب المتفوق دراسياً', '🏆', 'violet'),
  ('participation', 'شارة المشاركة', 'تمنح للطالب الفاعل في المشاركة', '🙋', 'cyan'),
  ('creativity', 'شارة الإبداع', 'تمنح للطالب المبدع', '🎨', 'rose'),
  ('perseverance', 'شارة المثابرة', 'تمنح للطالب المثابر والمجتهد', '💪', 'emerald'),
  ('leadership', 'شارة القيادة', 'تمنح للطالب القائد', '👑', 'amber'),
  ('honor_student', 'شارة طالب الأسبوع', 'الطالب المتصدر هذا الأسبوع', '🎖️', 'violet'),
  ('helpful', 'شارة المساعد', 'تمنح للطالب المساعد لزملائه', '🤝', 'cyan')
ON CONFLICT (id) DO NOTHING;

-- Tighten user_badges insert: teachers/admins can grant any badge to any user;
-- regular users can only insert badges for themselves (auto-awards via triggers run as definer).
DROP POLICY IF EXISTS ub_insert_service ON public.user_badges;
CREATE POLICY ub_insert_self_or_teacher ON public.user_badges
  FOR INSERT WITH CHECK (
    auth.uid() = user_id
    OR public.is_teacher(auth.uid())
  );

-- Notify the recipient when a badge is granted
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
CREATE TRIGGER trg_new_badge AFTER INSERT ON public.user_badges
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_badge();


-- ========== 20260508125852_9f838e59-4efb-46c0-8430-5c8e5ed2d938.sql ==========
ALTER TABLE public.activities ALTER COLUMN file_url DROP NOT NULL;
ALTER TABLE public.activities ALTER COLUMN file_type DROP NOT NULL;
ALTER TABLE public.activities ALTER COLUMN file_url SET DEFAULT NULL;
ALTER TABLE public.activities ALTER COLUMN file_type SET DEFAULT NULL;

-- ========== 20260508131518_5c9bcc0e-0a2a-4759-9357-4b5163698b0c.sql ==========

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
DROP FUNCTION IF EXISTS public.award_weekly_top();

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


-- ========== 20260508140054_46a2744b-73af-4b06-9c44-dac37cdb2ecc.sql ==========
-- Apply combined initial schema (from project's existing migrations)
DO $$ BEGIN PERFORM 1; END $$;

-- ========== 20260508140430_caa5b8cf-6c93-4f8c-830c-62c86a9e1845.sql ==========
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

-- ========== 20260508140452_7c53f449-4c82-491f-a10f-0a43e8f020a9.sql ==========
CREATE OR REPLACE FUNCTION public.join_teacher_by_code(_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid(); _tid UUID;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  SELECT id INTO _tid FROM public.profiles
    WHERE class_code = upper(trim(_code)) AND role_type = 'teacher' LIMIT 1;
  IF _tid IS NULL THEN RETURN false; END IF;
  UPDATE public.profiles SET teacher_id = _tid WHERE id = _uid;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.add_student_by_email(_email text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid UUID := auth.uid(); _sid UUID;
BEGIN
  IF _uid IS NULL OR NOT public.is_teacher(_uid) THEN RETURN false; END IF;
  SELECT id INTO _sid FROM auth.users WHERE lower(email) = lower(trim(_email)) LIMIT 1;
  IF _sid IS NULL THEN RETURN false; END IF;
  UPDATE public.profiles SET teacher_id = _uid WHERE id = _sid;
  INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (_sid, 'system', 'تم إضافتك إلى فصل المعلم', 'قام معلم بإضافتك إلى قائمة طلابه', '/profile');
  RETURN true;
END $$;

REVOKE EXECUTE ON FUNCTION public.join_teacher_by_code(text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.add_student_by_email(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.join_teacher_by_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_student_by_email(text) TO authenticated;

-- ========== 20260508152801_b967f021-acf3-4a12-8f20-742b3a28def7.sql ==========
-- 1) Make is_teacher also accept profile role_type
CREATE OR REPLACE FUNCTION public.is_teacher(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
      OR public.has_role(_user_id, 'teacher'::public.app_role)
      OR public.has_role(_user_id, 'supervisor'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = _user_id AND role_type IN ('teacher','supervisor')
      )
$$;

-- 2) Add quiz attempt details
ALTER TABLE public.quiz_attempts
  ADD COLUMN IF NOT EXISTS details jsonb;

-- 3) Insert/refresh badges catalog
INSERT INTO public.badges (id, name, description, icon, color, audience) VALUES
  -- student
  ('first_activity',     'أول نشاط',          'رفعت أول نشاط',          '✨','amber','student'),
  ('five_activities',    '5 أنشطة',           'وصلت إلى 5 أنشطة',       '🔥','amber','student'),
  ('ten_activities',     '10 أنشطة',          '10 أنشطة وأكثر',         '⚡','amber','student'),
  ('first_comment',      'أول تعليق',          'شاركت بأول تعليق',       '💬','cyan','student'),
  ('quiz_starter',       'بداية موفقة',        'حللت أول اختبار',        '🎯','rose','student'),
  ('quiz_master',        'بطل الاختبارات',     '5 اختبارات بنجاح',       '🏆','rose','student'),
  ('competition_winner', 'بطل المسابقات',      'أجبت إجابة صحيحة بالمسابقة','🥇','amber','student'),
  ('creative',           'مبدع',               'شاركت في معرض الإبداع',   '🎨','violet','student'),
  ('honor_student',      'نجم الأسبوع',        'الأعلى نقاطاً هذا الأسبوع','🎖️','amber','student'),
  ('certificate_holder', 'حامل الشهادة',       'حصلت على شهادة تقدير',    '🏅','emerald','student'),
  ('helpful_friend',     'الصديق المساعد',     'تفاعل إيجابي مع الزملاء',  '🤝','cyan','student'),
  ('top10',              'ضمن العشرة الأوائل', 'دخلت قائمة العشرة الأوائل','🌟','violet','student'),
  -- teacher
  ('first_quiz_made',    'أول اختبار',         'أنشأت أول اختبار',        '📝','emerald','teacher'),
  ('first_competition',  'أول مسابقة',         'أنشأت أول مسابقة',        '🎯','amber','teacher'),
  ('first_assignment',   'أول واجب',           'أنشأت أول واجب',          '📚','cyan','teacher'),
  ('certificate_giver',  'مانح الشهادات',      'منحت شهادة لطالب',        '🏅','violet','teacher'),
  ('top_teacher',        'المعلم المتميز',     'الأعلى نقاطاً هذا الأسبوع', '👑','amber','teacher'),
  ('class_builder',      'باني الفصل',         'أضفت 5 طلاب لفصلك',       '🏗️','emerald','teacher'),
  ('active_teacher',     'المعلم النشط',       'مشاركات متعددة في المنصة', '⚡','rose','teacher')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  icon = EXCLUDED.icon, color = EXCLUDED.color, audience = EXCLUDED.audience;

-- 4) Award weekly top function (single winner per audience)
DROP FUNCTION IF EXISTS public.award_weekly_top();

CREATE OR REPLACE FUNCTION public.award_weekly_top()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  top_student uuid;
  top_teacher uuid;
BEGIN
  -- pick current top
  SELECT id INTO top_student FROM public.profiles
    WHERE role_type = 'student' OR role_type IS NULL
    ORDER BY points DESC NULLS LAST LIMIT 1;
  SELECT id INTO top_teacher FROM public.profiles
    WHERE role_type IN ('teacher','supervisor')
    ORDER BY points DESC NULLS LAST LIMIT 1;

  -- Remove old winners (so badge is exclusive to current top)
  IF top_student IS NOT NULL THEN
    DELETE FROM public.user_badges WHERE badge_id = 'honor_student' AND user_id <> top_student;
    INSERT INTO public.user_badges(user_id, badge_id) VALUES (top_student, 'honor_student')
      ON CONFLICT DO NOTHING;
    INSERT INTO public.weekly_top(user_id, week_start, points, role_type)
    SELECT top_student, date_trunc('week', now())::date, points, 'student'
      FROM public.profiles WHERE id = top_student
    ON CONFLICT DO NOTHING;
  END IF;

  IF top_teacher IS NOT NULL THEN
    DELETE FROM public.user_badges WHERE badge_id = 'top_teacher' AND user_id <> top_teacher;
    INSERT INTO public.user_badges(user_id, badge_id) VALUES (top_teacher, 'top_teacher')
      ON CONFLICT DO NOTHING;
    INSERT INTO public.weekly_top(user_id, week_start, points, role_type)
    SELECT top_teacher, date_trunc('week', now())::date, points, 'teacher'
      FROM public.profiles WHERE id = top_teacher
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object('top_student', top_student, 'top_teacher', top_teacher);
END $$;

-- 5) Auto-award on certificate received
CREATE OR REPLACE FUNCTION public.award_on_certificate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_badges(user_id, badge_id) VALUES (NEW.student_id, 'certificate_holder')
    ON CONFLICT DO NOTHING;
  INSERT INTO public.user_badges(user_id, badge_id) VALUES (NEW.teacher_id, 'certificate_giver')
    ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS award_on_certificate_t ON public.certificates;
CREATE TRIGGER award_on_certificate_t AFTER INSERT ON public.certificates
  FOR EACH ROW EXECUTE FUNCTION public.award_on_certificate();

-- 6) Auto-award on quiz attempt
CREATE OR REPLACE FUNCTION public.award_on_quiz()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cnt INT;
BEGIN
  SELECT COUNT(*) INTO cnt FROM public.quiz_attempts WHERE user_id = NEW.user_id;
  IF cnt >= 1 THEN
    INSERT INTO public.user_badges(user_id, badge_id) VALUES (NEW.user_id, 'quiz_starter') ON CONFLICT DO NOTHING;
  END IF;
  IF cnt >= 5 THEN
    INSERT INTO public.user_badges(user_id, badge_id) VALUES (NEW.user_id, 'quiz_master') ON CONFLICT DO NOTHING;
  END IF;
  -- give points
  UPDATE public.profiles SET points = COALESCE(points,0) + COALESCE(NEW.score,0) WHERE id = NEW.user_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS award_on_quiz_t ON public.quiz_attempts;
CREATE TRIGGER award_on_quiz_t AFTER INSERT ON public.quiz_attempts
  FOR EACH ROW EXECUTE FUNCTION public.award_on_quiz();

-- 7) Auto-award on competition correct submission
CREATE OR REPLACE FUNCTION public.award_on_competition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_correct THEN
    INSERT INTO public.user_badges(user_id, badge_id) VALUES (NEW.user_id, 'competition_winner') ON CONFLICT DO NOTHING;
    UPDATE public.profiles SET points = COALESCE(points,0) + 5 WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS award_on_competition_t ON public.competition_submissions;
CREATE TRIGGER award_on_competition_t AFTER INSERT OR UPDATE ON public.competition_submissions
  FOR EACH ROW EXECUTE FUNCTION public.award_on_competition();

-- 8) Award teacher badges on creating quiz/competition/assignment
CREATE OR REPLACE FUNCTION public.award_teacher_first_quiz()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN INSERT INTO public.user_badges(user_id, badge_id) VALUES (NEW.created_by, 'first_quiz_made') ON CONFLICT DO NOTHING; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS award_teacher_first_quiz_t ON public.quizzes;
CREATE TRIGGER award_teacher_first_quiz_t AFTER INSERT ON public.quizzes
  FOR EACH ROW EXECUTE FUNCTION public.award_teacher_first_quiz();

CREATE OR REPLACE FUNCTION public.award_teacher_first_competition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN INSERT INTO public.user_badges(user_id, badge_id) VALUES (NEW.created_by, 'first_competition') ON CONFLICT DO NOTHING; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS award_teacher_first_comp_t ON public.competitions;
CREATE TRIGGER award_teacher_first_comp_t AFTER INSERT ON public.competitions
  FOR EACH ROW EXECUTE FUNCTION public.award_teacher_first_competition();

CREATE OR REPLACE FUNCTION public.award_teacher_first_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN INSERT INTO public.user_badges(user_id, badge_id) VALUES (NEW.teacher_id, 'first_assignment') ON CONFLICT DO NOTHING; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS award_teacher_first_assign_t ON public.assignments;
CREATE TRIGGER award_teacher_first_assign_t AFTER INSERT ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.award_teacher_first_assignment();

-- 9) Award first_comment badge
CREATE OR REPLACE FUNCTION public.award_first_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_badges(user_id, badge_id) VALUES (NEW.user_id, 'first_comment') ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS award_first_comment_act_t ON public.activity_comments;
CREATE TRIGGER award_first_comment_act_t AFTER INSERT ON public.activity_comments
  FOR EACH ROW EXECUTE FUNCTION public.award_first_comment();
DROP TRIGGER IF EXISTS award_first_comment_gal_t ON public.gallery_comments;
CREATE TRIGGER award_first_comment_gal_t AFTER INSERT ON public.gallery_comments
  FOR EACH ROW EXECUTE FUNCTION public.award_first_comment();

-- 10) Award creative badge on contest entry
CREATE OR REPLACE FUNCTION public.award_creative()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN INSERT INTO public.user_badges(user_id, badge_id) VALUES (NEW.user_id, 'creative') ON CONFLICT DO NOTHING; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS award_creative_t ON public.gallery_contest_entries;
CREATE TRIGGER award_creative_t AFTER INSERT ON public.gallery_contest_entries
  FOR EACH ROW EXECUTE FUNCTION public.award_creative();

-- ========== 20260508161117_4addf401-7f2f-4fd7-b0c7-c5cf8e8884a2.sql ==========

ALTER TABLE public.user_badges DROP CONSTRAINT IF EXISTS user_badges_user_id_badge_id_key;

DROP POLICY IF EXISTS badges_insert_teacher ON public.badges;
CREATE POLICY badges_insert_teacher ON public.badges
  FOR INSERT TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin'::public.app_role, 'teacher'::public.app_role, 'supervisor'::public.app_role)
    )
  );


-- ========== 20260508165954_56573cf6-3bdf-4a51-b848-9f970747bd5c.sql ==========
INSERT INTO public.badges (id, name, description, icon, color, audience) VALUES
  ('excellence',         'شارة التميز',           'تميز ملحوظ في الأداء',         '🌟', 'amber',   'student'),
  ('distinction',        'شارة التفوق',           'تفوق دراسي مستمر',             '🏆', 'amber',   'student'),
  ('participation',      'شارة المشاركة',         'مشاركة فعالة في الأنشطة',       '🙋', 'cyan',    'student'),
  ('creativity',         'شارة الإبداع',          'فكر إبداعي ومبتكر',            '🎨', 'rose',    'student'),
  ('creative',           'شارة المبدع',           'إبداع في معرض الإبداعات',       '✨', 'rose',    'student'),
  ('perseverance',       'شارة المثابرة',         'مثابرة وعدم استسلام',           '💪', 'emerald', 'student'),
  ('leadership',         'شارة القيادة',          'مهارات قيادية مميزة',           '👑', 'violet',  'student'),
  ('honor_student',      'طالب الأسبوع',          'الطالب الأعلى نقاطاً هذا الأسبوع','🎖️','amber',   'student'),
  ('helpful',            'شارة المساعد',          'مساعدة الزملاء',                '🤝', 'cyan',    'student'),
  ('first_activity',     'أول نشاط',              'أول نشاط مقبول',                '✨', 'emerald', 'student'),
  ('five_activities',    '٥ أنشطة',              'إنجاز 5 أنشطة',                 '🔥', 'rose',    'student'),
  ('ten_activities',     '١٠ أنشطة',             'إنجاز 10 أنشطة',                '⚡', 'violet',  'student'),
  ('competition_winner', 'بطل المسابقات',         'إجابة صحيحة في المسابقات',       '🥇', 'amber',   'student'),
  ('first_comment',      'أول تعليق',             'أول تعليق على نشاط',            '💬', 'cyan',    'student'),
  ('quiz_starter',       'بداية الاختبارات',      'حل أول اختبار',                 '📝', 'emerald', 'student'),
  ('quiz_master',        'سيد الاختبارات',        'حل 5 اختبارات أو أكثر',         '🧠', 'violet',  'student'),
  ('certificate_holder', 'حامل الشهادة',          'حصلت على شهادة تقدير',          '📜', 'amber',   'student'),
  ('top_teacher',        'المعلم المتميز',        'المعلم الأعلى نقاطاً هذا الأسبوع','🎓','emerald', 'teacher'),
  ('first_assignment',   'أول واجب',              'إنشاء أول واجب',                '📋', 'cyan',    'teacher'),
  ('first_quiz_made',    'أول اختبار',            'إنشاء أول اختبار',              '🧩', 'rose',    'teacher'),
  ('first_competition',  'أول مسابقة',            'إنشاء أول مسابقة',              '🏁', 'amber',   'teacher'),
  ('certificate_giver',  'مانح الشهادات',         'منح شهادة لطالب',               '🏅', 'violet',  'teacher')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  audience = EXCLUDED.audience;

-- ========== 20260508172229_db8c498a-b290-4252-8596-d4af93a4c0cd.sql ==========

-- realtime (skip if already added)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.direct_messages REPLICA IDENTITY FULL;

ALTER TABLE public.user_badges ADD COLUMN IF NOT EXISTS awarded_by uuid;

DELETE FROM public.user_badges a
USING public.user_badges b
WHERE a.user_id = b.user_id
  AND a.badge_id = b.badge_id
  AND a.id <> b.id
  AND a.earned_at > b.earned_at
  AND a.awarded_by IS NULL
  AND b.awarded_by IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_badges_system_unique
  ON public.user_badges(user_id, badge_id)
  WHERE awarded_by IS NULL;

DROP FUNCTION IF EXISTS public.award_weekly_top();

CREATE OR REPLACE FUNCTION public.award_weekly_top()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  top_student uuid;
  top_teacher uuid;
  cur_week date := date_trunc('week', now())::date;
BEGIN
  SELECT id INTO top_student FROM public.profiles
    WHERE role_type = 'student' OR role_type IS NULL
    ORDER BY points DESC NULLS LAST LIMIT 1;
  SELECT id INTO top_teacher FROM public.profiles
    WHERE role_type IN ('teacher','supervisor')
    ORDER BY points DESC NULLS LAST LIMIT 1;

  IF top_student IS NOT NULL THEN
    DELETE FROM public.user_badges WHERE badge_id = 'honor_student' AND user_id <> top_student AND awarded_by IS NULL;
    INSERT INTO public.user_badges(user_id, badge_id) VALUES (top_student, 'honor_student') ON CONFLICT DO NOTHING;
    IF NOT EXISTS (SELECT 1 FROM public.weekly_top WHERE user_id = top_student AND week_start = cur_week) THEN
      INSERT INTO public.weekly_top(user_id, week_start, points, role_type)
      SELECT top_student, cur_week, points, 'student' FROM public.profiles WHERE id = top_student;
    END IF;
  END IF;

  IF top_teacher IS NOT NULL THEN
    DELETE FROM public.user_badges WHERE badge_id = 'top_teacher' AND user_id <> top_teacher AND awarded_by IS NULL;
    INSERT INTO public.user_badges(user_id, badge_id) VALUES (top_teacher, 'top_teacher') ON CONFLICT DO NOTHING;
    IF NOT EXISTS (SELECT 1 FROM public.weekly_top WHERE user_id = top_teacher AND week_start = cur_week) THEN
      INSERT INTO public.weekly_top(user_id, week_start, points, role_type)
      SELECT top_teacher, cur_week, points, 'teacher' FROM public.profiles WHERE id = top_teacher;
    END IF;
  END IF;

  RETURN jsonb_build_object('top_student', top_student, 'top_teacher', top_teacher);
END $function$;

-- de-dup weekly_top by (user_id, week_start) keeping the earliest created row
DELETE FROM public.weekly_top wt
WHERE wt.id NOT IN (
  SELECT DISTINCT ON (user_id, week_start) id
  FROM public.weekly_top
  ORDER BY user_id, week_start, created_at ASC
);
CREATE UNIQUE INDEX IF NOT EXISTS weekly_top_user_week_unique
  ON public.weekly_top(user_id, week_start);

-- de-dup honor_student / top_teacher badges
DELETE FROM public.user_badges ub
WHERE ub.badge_id IN ('honor_student','top_teacher')
  AND ub.id NOT IN (
    SELECT DISTINCT ON (user_id, badge_id) id
    FROM public.user_badges
    WHERE badge_id IN ('honor_student','top_teacher')
    ORDER BY user_id, badge_id, earned_at ASC
  );

CREATE TABLE IF NOT EXISTS public.ai_image_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_image_usage ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY aiu_select_own ON public.ai_image_usage FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS ai_image_usage_user_day ON public.ai_image_usage(user_id, created_at);


-- ========== 20260508173412_f4120216-4193-4a9a-8293-bffe8db3e151.sql ==========
CREATE POLICY qa_update_teacher ON public.quiz_attempts
FOR UPDATE TO public
USING (public.is_teacher(auth.uid()))
WITH CHECK (public.is_teacher(auth.uid()));

-- ========== 20260508175740_5a8d8ca8-03de-4779-83aa-42a8480d021a.sql ==========

-- 1) Ban protection trigger
CREATE OR REPLACE FUNCTION public.guard_profile_ban()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller uuid := auth.uid();
  caller_is_admin boolean := public.has_role(caller, 'admin'::app_role);
  target_is_admin boolean := public.has_role(NEW.id, 'admin'::app_role);
  target_is_teacher boolean := public.has_role(NEW.id, 'teacher'::app_role) OR public.has_role(NEW.id, 'supervisor'::app_role);
BEGIN
  IF NEW.is_banned IS DISTINCT FROM OLD.is_banned THEN
    -- Admin can do anything (also: admin cannot be banned by anyone but themselves; we still block)
    IF target_is_admin AND NOT caller_is_admin THEN
      RAISE EXCEPTION 'لا يمكن حظر مشرف عام';
    END IF;
    IF target_is_admin AND NEW.is_banned = true THEN
      RAISE EXCEPTION 'لا يمكن حظر مشرف عام';
    END IF;
    IF target_is_teacher AND NOT caller_is_admin THEN
      RAISE EXCEPTION 'فقط المشرف العام يمكنه حظر المعلمين/المشرفين';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_profile_ban ON public.profiles;
CREATE TRIGGER trg_guard_profile_ban
BEFORE UPDATE OF is_banned ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_ban();

-- Allow teachers/supervisors to ban students (update only is_banned)
DROP POLICY IF EXISTS profiles_teacher_ban ON public.profiles;
CREATE POLICY profiles_teacher_ban ON public.profiles
FOR UPDATE TO public
USING (public.is_teacher(auth.uid()))
WITH CHECK (public.is_teacher(auth.uid()));

-- 2) Allow text-only gallery contest entries
ALTER TABLE public.gallery_contest_entries ALTER COLUMN media_url DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.gce_require_content()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.media_url IS NULL OR length(trim(NEW.media_url)) = 0)
     AND (NEW.caption IS NULL OR length(trim(NEW.caption)) = 0) THEN
    RAISE EXCEPTION 'يجب إضافة نص أو ملف للمشاركة';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_gce_require_content ON public.gallery_contest_entries;
CREATE TRIGGER trg_gce_require_content
BEFORE INSERT OR UPDATE ON public.gallery_contest_entries
FOR EACH ROW EXECUTE FUNCTION public.gce_require_content();

-- 3) Notify teacher on new quiz attempt
CREATE OR REPLACE FUNCTION public.notify_teacher_on_quiz_attempt()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q_title text;
  q_owner uuid;
  s_name text;
BEGIN
  SELECT title, created_by INTO q_title, q_owner FROM public.quizzes WHERE id = NEW.quiz_id;
  IF q_owner IS NULL OR q_owner = NEW.user_id THEN RETURN NEW; END IF;
  SELECT display_name INTO s_name FROM public.profiles WHERE id = NEW.user_id;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (q_owner, 'quiz_attempt',
          'محاولة جديدة لاختبار: ' || COALESCE(q_title,''),
          COALESCE(s_name,'طالب') || ' حصل على ' || NEW.score || '/' || NEW.total,
          '/teacher');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_teacher_quiz ON public.quiz_attempts;
CREATE TRIGGER trg_notify_teacher_quiz
AFTER INSERT ON public.quiz_attempts
FOR EACH ROW EXECUTE FUNCTION public.notify_teacher_on_quiz_attempt();

-- 4) Notify student when their attempt is graded (score changes)
CREATE OR REPLACE FUNCTION public.notify_student_on_grade()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q_title text;
BEGIN
  IF NEW.score IS DISTINCT FROM OLD.score OR NEW.total IS DISTINCT FROM OLD.total THEN
    SELECT title INTO q_title FROM public.quizzes WHERE id = NEW.quiz_id;
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (NEW.user_id, 'quiz_graded',
            'تم تصحيح اختبارك ✅',
            COALESCE(q_title,'الاختبار') || ' — درجتك: ' || NEW.score || '/' || NEW.total,
            '/quizzes');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_student_grade ON public.quiz_attempts;
CREATE TRIGGER trg_notify_student_grade
AFTER UPDATE ON public.quiz_attempts
FOR EACH ROW EXECUTE FUNCTION public.notify_student_on_grade();

-- 5) Realtime for notifications
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;


-- ========== 20260508182227_815e0200-e0ee-457a-9f59-d36f7479df9c.sql ==========

-- 1) Tighten ban policy: only admin/supervisor can update bans (not regular teachers)
DROP POLICY IF EXISTS profiles_teacher_ban ON public.profiles;
CREATE POLICY profiles_supervisor_ban ON public.profiles
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

-- 2) Update ban guard: supervisors can only ban students/parents; admin can ban all (except admin)
CREATE OR REPLACE FUNCTION public.guard_profile_ban()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  caller uuid := auth.uid();
  caller_is_admin boolean := public.has_role(caller, 'admin'::app_role);
  caller_is_supervisor boolean := public.has_role(caller, 'supervisor'::app_role);
  target_is_admin boolean := public.has_role(NEW.id, 'admin'::app_role);
  target_is_teacher boolean := public.has_role(NEW.id, 'teacher'::app_role) OR public.has_role(NEW.id, 'supervisor'::app_role);
BEGIN
  IF NEW.is_banned IS DISTINCT FROM OLD.is_banned THEN
    -- Admin is fully protected
    IF target_is_admin THEN
      RAISE EXCEPTION 'لا يمكن حظر مشرف عام';
    END IF;
    -- Only admin can ban teacher or supervisor
    IF target_is_teacher AND NOT caller_is_admin THEN
      RAISE EXCEPTION 'فقط المشرف العام يمكنه حظر المعلمين/المشرفين';
    END IF;
    -- Caller must be admin or supervisor
    IF NOT caller_is_admin AND NOT caller_is_supervisor THEN
      RAISE EXCEPTION 'صلاحية الحظر للمشرف العام والمشرفين فقط';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_guard_profile_ban ON public.profiles;
CREATE TRIGGER trg_guard_profile_ban
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_ban();

-- 3) Quiz: one attempt per student per quiz
DO $$ BEGIN
  ALTER TABLE public.quiz_attempts ADD CONSTRAINT quiz_attempts_unique_user UNIQUE (quiz_id, user_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;

-- 4) Assignment: one submission per student per assignment
DO $$ BEGIN
  ALTER TABLE public.assignment_submissions ADD CONSTRAINT assignment_subs_unique_student UNIQUE (assignment_id, student_id);
EXCEPTION WHEN duplicate_table OR duplicate_object THEN NULL; END $$;

-- 5) Realtime for direct messages (faster delivery)
ALTER TABLE public.direct_messages REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- ========== 20260508183041_b9db45ee-d8ea-4cef-abda-ff1b58cddcda.sql ==========
CREATE OR REPLACE FUNCTION public.claim_supervisor_role(_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid UUID := auth.uid(); _existing text;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF _code <> 'WUSTA-S-2026' THEN RETURN false; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'supervisor'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  SELECT class_code INTO _existing FROM public.profiles WHERE id = _uid;
  UPDATE public.profiles SET role_type = 'supervisor',
    class_code = COALESCE(_existing, public.generate_class_code()) WHERE id = _uid;
  RETURN true;
END; $$;

-- ========== 20260508185429_8ee4b38b-0a53-4487-ae63-8d8448417772.sql ==========
-- Restore core badge catalog used by automatic awards and teacher panel
INSERT INTO public.badges (id, name, description, icon, color, audience) VALUES
  ('first_activity', 'أول نشاط', 'نشر أول نشاط معتمد', '📚', 'emerald', 'student'),
  ('five_activities', 'خمس أنشطة', 'نشر 5 أنشطة معتمدة', '🌟', 'amber', 'student'),
  ('ten_activities', 'عشرة أنشطة', 'نشر 10 أنشطة معتمدة', '🏆', 'violet', 'student'),
  ('first_comment', 'أول تعليق', 'شارك بأول تعليق', '💬', 'cyan', 'student'),
  ('creative', 'مبدع المعرض', 'شارك في مسابقات الإبداع', '🎨', 'rose', 'student'),
  ('competition_winner', 'فائز المسابقات', 'إجابة صحيحة في مسابقة', '🥇', 'amber', 'student'),
  ('quiz_starter', 'بدأ الاختبارات', 'حل أول اختبار', '📝', 'emerald', 'student'),
  ('quiz_master', 'محترف الاختبارات', 'حل 5 اختبارات', '🧠', 'violet', 'student'),
  ('certificate_holder', 'صاحب شهادة', 'حصل على شهادة تقدير', '🎖️', 'amber', 'student'),
  ('honor_student', 'طالب لوحة الشرف', 'ضمن لوحة الشرف الأسبوعية', '👑', 'amber', 'student'),
  ('student_of_week', 'طالب الأسبوع', 'تميز هذا الأسبوع', '🌟', 'amber', 'student'),
  ('first_quiz_made', 'أول اختبار', 'أنشأ أول اختبار', '🧪', 'cyan', 'teacher'),
  ('first_competition', 'أول مسابقة', 'أنشأ أول مسابقة', '🏁', 'rose', 'teacher'),
  ('first_assignment', 'أول واجب', 'أنشأ أول واجب', '📋', 'emerald', 'teacher'),
  ('certificate_giver', 'مانح الشهادات', 'منح شهادة تقدير', '🏅', 'violet', 'teacher'),
  ('top_teacher', 'معلم لوحة الشرف', 'ضمن لوحة الشرف الأسبوعية', '👑', 'amber', 'teacher'),
  ('teacher_of_week', 'معلم الأسبوع', 'تميز هذا الأسبوع', '🌟', 'amber', 'teacher')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  audience = EXCLUDED.audience;

-- Safe helper: award a badge only if the badge exists, preventing FK failures from breaking user actions
CREATE OR REPLACE FUNCTION public.safe_award_badge(_user_id uuid, _badge_id text, _awarded_by uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR _badge_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.badges WHERE id = _badge_id) THEN
    INSERT INTO public.user_badges(user_id, badge_id, awarded_by)
    VALUES (_user_id, _badge_id, _awarded_by)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.award_first_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.safe_award_badge(NEW.user_id, 'first_comment');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.award_creative()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.safe_award_badge(NEW.user_id, 'creative');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.award_activity_badges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE cnt integer;
BEGIN
  IF NEW.status = 'approved' THEN
    SELECT COUNT(*) INTO cnt FROM public.activities WHERE user_id = NEW.user_id AND status = 'approved';
    IF cnt >= 1 THEN PERFORM public.safe_award_badge(NEW.user_id, 'first_activity'); END IF;
    IF cnt >= 5 THEN PERFORM public.safe_award_badge(NEW.user_id, 'five_activities'); END IF;
    IF cnt >= 10 THEN PERFORM public.safe_award_badge(NEW.user_id, 'ten_activities'); END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.award_on_quiz()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE cnt integer;
BEGIN
  SELECT COUNT(*) INTO cnt FROM public.quiz_attempts WHERE user_id = NEW.user_id;
  IF cnt >= 1 THEN PERFORM public.safe_award_badge(NEW.user_id, 'quiz_starter'); END IF;
  IF cnt >= 5 THEN PERFORM public.safe_award_badge(NEW.user_id, 'quiz_master'); END IF;
  UPDATE public.profiles SET points = COALESCE(points, 0) + COALESCE(NEW.score, 0) WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.award_on_competition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_correct THEN
    PERFORM public.safe_award_badge(NEW.user_id, 'competition_winner');
    UPDATE public.profiles SET points = COALESCE(points, 0) + 5 WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.award_on_certificate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.safe_award_badge(NEW.student_id, 'certificate_holder');
  PERFORM public.safe_award_badge(NEW.teacher_id, 'certificate_giver');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.award_teacher_first_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.safe_award_badge(NEW.teacher_id, 'first_assignment');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.award_teacher_first_quiz()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.safe_award_badge(NEW.created_by, 'first_quiz_made');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.award_teacher_first_competition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.safe_award_badge(NEW.created_by, 'first_competition');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_new_badge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE bname text;
BEGIN
  SELECT name INTO bname FROM public.badges WHERE id = NEW.badge_id;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (NEW.user_id, 'badge', 'حصلت على شارة جديدة 🏅', COALESCE(bname, NEW.badge_id), '/badges');
  RETURN NEW;
END;
$$;

-- Recreate missing triggers
DROP TRIGGER IF EXISTS award_first_comment_act_t ON public.activity_comments;
CREATE TRIGGER award_first_comment_act_t AFTER INSERT ON public.activity_comments
FOR EACH ROW EXECUTE FUNCTION public.award_first_comment();

DROP TRIGGER IF EXISTS award_first_comment_gal_t ON public.gallery_comments;
CREATE TRIGGER award_first_comment_gal_t AFTER INSERT ON public.gallery_comments
FOR EACH ROW EXECUTE FUNCTION public.award_first_comment();

DROP TRIGGER IF EXISTS award_creative_t ON public.gallery_contest_entries;
CREATE TRIGGER award_creative_t AFTER INSERT ON public.gallery_contest_entries
FOR EACH ROW EXECUTE FUNCTION public.award_creative();

DROP TRIGGER IF EXISTS award_activity_badges_t ON public.activities;
CREATE TRIGGER award_activity_badges_t AFTER INSERT OR UPDATE ON public.activities
FOR EACH ROW EXECUTE FUNCTION public.award_activity_badges();

DROP TRIGGER IF EXISTS award_on_quiz_t ON public.quiz_attempts;
CREATE TRIGGER award_on_quiz_t AFTER INSERT ON public.quiz_attempts
FOR EACH ROW EXECUTE FUNCTION public.award_on_quiz();

DROP TRIGGER IF EXISTS award_on_competition_t ON public.competition_submissions;
CREATE TRIGGER award_on_competition_t AFTER INSERT OR UPDATE ON public.competition_submissions
FOR EACH ROW EXECUTE FUNCTION public.award_on_competition();

DROP TRIGGER IF EXISTS award_on_certificate_t ON public.certificates;
CREATE TRIGGER award_on_certificate_t AFTER INSERT ON public.certificates
FOR EACH ROW EXECUTE FUNCTION public.award_on_certificate();

DROP TRIGGER IF EXISTS award_teacher_first_assignment_t ON public.assignments;
CREATE TRIGGER award_teacher_first_assignment_t AFTER INSERT ON public.assignments
FOR EACH ROW EXECUTE FUNCTION public.award_teacher_first_assignment();

DROP TRIGGER IF EXISTS award_teacher_first_quiz_t ON public.quizzes;
CREATE TRIGGER award_teacher_first_quiz_t AFTER INSERT ON public.quizzes
FOR EACH ROW EXECUTE FUNCTION public.award_teacher_first_quiz();

DROP TRIGGER IF EXISTS award_teacher_first_competition_t ON public.competitions;
CREATE TRIGGER award_teacher_first_competition_t AFTER INSERT ON public.competitions
FOR EACH ROW EXECUTE FUNCTION public.award_teacher_first_competition();

DROP TRIGGER IF EXISTS trg_new_badge ON public.user_badges;
CREATE TRIGGER trg_new_badge AFTER INSERT ON public.user_badges
FOR EACH ROW EXECUTE FUNCTION public.notify_new_badge();

-- Ban guard: admins can ban supervisors/teachers; supervisors can ban only students/parents; admins themselves cannot be banned
CREATE OR REPLACE FUNCTION public.guard_profile_ban()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  caller_is_admin boolean := public.has_role(caller, 'admin'::app_role);
  caller_is_supervisor boolean := public.has_role(caller, 'supervisor'::app_role);
  target_is_admin boolean := public.has_role(NEW.id, 'admin'::app_role);
  target_is_staff boolean := public.has_role(NEW.id, 'teacher'::app_role)
    OR public.has_role(NEW.id, 'supervisor'::app_role)
    OR COALESCE(NEW.role_type, '') IN ('teacher', 'supervisor');
BEGIN
  IF NEW.is_banned IS DISTINCT FROM OLD.is_banned THEN
    IF target_is_admin THEN
      RAISE EXCEPTION 'لا يمكن حظر المشرف العام';
    END IF;
    IF caller_is_admin THEN
      RETURN NEW;
    END IF;
    IF caller_is_supervisor AND NOT target_is_staff THEN
      RETURN NEW;
    END IF;
    IF target_is_staff THEN
      RAISE EXCEPTION 'فقط المشرف العام يمكنه حظر المعلمين/المشرفين';
    END IF;
    RAISE EXCEPTION 'صلاحية الحظر للمشرف العام والمشرفين فقط';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_ban_t ON public.profiles;
CREATE TRIGGER guard_profile_ban_t BEFORE UPDATE OF is_banned ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_ban();

-- ========== 20260508185811_823e3191-6f3f-47f8-b4f7-e0a0da1f01be.sql ==========
CREATE OR REPLACE FUNCTION public.safe_award_badge(_user_id uuid, _badge_id text, _awarded_by uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR _badge_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM public.badges WHERE id = _badge_id) THEN
    RETURN;
  END IF;

  -- Automatic badges should be granted once only; teacher-granted badges may be repeated.
  IF _awarded_by IS NULL AND EXISTS (
    SELECT 1 FROM public.user_badges
    WHERE user_id = _user_id AND badge_id = _badge_id AND awarded_by IS NULL
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.user_badges(user_id, badge_id, awarded_by)
  VALUES (_user_id, _badge_id, _awarded_by);
END;
$$;

DROP TRIGGER IF EXISTS award_teacher_first_assign_t ON public.assignments;
DROP TRIGGER IF EXISTS award_teacher_first_comp_t ON public.competitions;

-- ========== 20260509070755_83c0450b-c2ea-44cc-8034-8de2860c426c.sql ==========

-- Allow supervisors to delete in addition to admins
DROP POLICY IF EXISTS messages_admin_delete ON public.messages;
CREATE POLICY messages_mod_delete ON public.messages FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

DROP POLICY IF EXISTS galc_delete_own ON public.gallery_comments;
CREATE POLICY galc_delete_own ON public.gallery_comments FOR DELETE
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

DROP POLICY IF EXISTS ac_delete_own ON public.activity_comments;
CREATE POLICY ac_delete_own ON public.activity_comments FOR DELETE
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

DROP POLICY IF EXISTS cc_delete_own ON public.competition_comments;
CREATE POLICY cc_delete_own ON public.competition_comments FOR DELETE
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

DROP POLICY IF EXISTS gce_delete_own ON public.gallery_contest_entries;
CREATE POLICY gce_delete_own ON public.gallery_contest_entries FOR DELETE
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

DROP POLICY IF EXISTS activities_admin_delete ON public.activities;
CREATE POLICY activities_mod_delete ON public.activities FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

DROP POLICY IF EXISTS comp_delete_owner ON public.competitions;
CREATE POLICY comp_delete_owner ON public.competitions FOR DELETE
USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

DROP POLICY IF EXISTS assignments_delete_owner ON public.assignments;
CREATE POLICY assignments_delete_owner ON public.assignments FOR DELETE
USING (auth.uid() = teacher_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

DROP POLICY IF EXISTS quizzes_delete_owner ON public.quizzes;
CREATE POLICY quizzes_delete_owner ON public.quizzes FOR DELETE
USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

DROP POLICY IF EXISTS gcst_delete_owner ON public.gallery_contests;
CREATE POLICY gcst_delete_owner ON public.gallery_contests FOR DELETE
USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

DROP POLICY IF EXISTS events_delete_owner ON public.events;
CREATE POLICY events_delete_owner ON public.events FOR DELETE
USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

-- Reports: add optional target reference + allow supervisors to view/manage
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS target_kind text;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS target_id uuid;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open';

DROP POLICY IF EXISTS reports_mod_all ON public.reports;
CREATE POLICY reports_mod_all ON public.reports FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));


-- ========== 20260509090400_security_lockdown.sql ==========
-- =============================================================
-- إغلاق ثغرات الأمان وقفل الرتب — تفعيل نظام الكود السري للمعلم
-- شغّل هذا الملف في Supabase SQL Editor دفعة واحدة.
-- =============================================================

-- 1) is_teacher يعتمد فقط على user_roles (لا role_type في profiles)
CREATE OR REPLACE FUNCTION public.is_teacher(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
      OR public.has_role(_user_id, 'teacher'::public.app_role)
      OR public.has_role(_user_id, 'supervisor'::public.app_role)
$$;

-- 2) Trigger يمنع المستخدم العادي من ترقية نفسه عبر role_type
CREATE OR REPLACE FUNCTION public.protect_role_type()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _is_admin boolean := public.has_role(auth.uid(), 'admin'::public.app_role);
  _is_teacher_role boolean := public.has_role(auth.uid(), 'teacher'::public.app_role)
                              OR public.has_role(auth.uid(), 'supervisor'::public.app_role);
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.role_type IS NOT NULL
       AND NEW.role_type NOT IN ('student','parent')
       AND NOT _is_admin AND NOT _is_teacher_role THEN
      NEW.role_type := 'student';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.role_type IS DISTINCT FROM OLD.role_type
       AND NEW.role_type IN ('teacher','supervisor')
       AND NOT _is_admin AND NOT _is_teacher_role THEN
      RAISE EXCEPTION 'لا يمكنك تغيير الرتبة. استخدم الكود السري للمعلم.';
    END IF;
  END IF;
  RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS profiles_protect_role_type ON public.profiles;
CREATE TRIGGER profiles_protect_role_type
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_role_type();

-- 3) claim_teacher_role: الكود الصحيح يضيف الدور في user_roles ويعدل role_type
CREATE OR REPLACE FUNCTION public.claim_teacher_role(_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _existing text;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF _code <> 'WUSTA-T-2026' AND _code <> 'TEACHER-2026' THEN RETURN false; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'teacher'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  SELECT class_code INTO _existing FROM public.profiles WHERE id = _uid;
  UPDATE public.profiles SET role_type = 'teacher',
    class_code = COALESCE(_existing, public.generate_class_code()) WHERE id = _uid;
  RETURN true;
END;$$;

-- =============================================================
-- 4) إخفاء أرقام الهواتف وبيانات الصف الحساسة في جدول خاص
-- =============================================================
CREATE TABLE IF NOT EXISTS public.profiles_private (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  phone text,
  grade text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.profiles_private (user_id, phone, grade)
SELECT id, phone, grade FROM public.profiles
WHERE phone IS NOT NULL OR grade IS NOT NULL
ON CONFLICT (user_id) DO UPDATE SET
  phone = COALESCE(public.profiles_private.phone, EXCLUDED.phone),
  grade = COALESCE(public.profiles_private.grade, EXCLUDED.grade);

ALTER TABLE public.profiles DROP COLUMN IF EXISTS phone;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS grade;

ALTER TABLE public.profiles_private ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pp_select_own_or_admin ON public.profiles_private;
CREATE POLICY pp_select_own_or_admin ON public.profiles_private FOR SELECT
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS pp_insert_own ON public.profiles_private;
CREATE POLICY pp_insert_own ON public.profiles_private FOR INSERT
  WITH CHECK (auth.uid() = user_id);
DROP POLICY IF EXISTS pp_update_own_or_admin ON public.profiles_private;
CREATE POLICY pp_update_own_or_admin ON public.profiles_private FOR UPDATE
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));
DROP POLICY IF EXISTS pp_delete_admin ON public.profiles_private;
CREATE POLICY pp_delete_admin ON public.profiles_private FOR DELETE
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));

-- =============================================================
-- 5) إخفاء إجابات المسابقات (correct_answer)
-- =============================================================
CREATE TABLE IF NOT EXISTS public.competition_secrets (
  competition_id uuid PRIMARY KEY REFERENCES public.competitions(id) ON DELETE CASCADE,
  correct_answer text,
  created_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.competition_secrets (competition_id, correct_answer)
SELECT id, correct_answer FROM public.competitions WHERE correct_answer IS NOT NULL
ON CONFLICT (competition_id) DO NOTHING;

UPDATE public.competitions SET correct_answer = NULL WHERE correct_answer IS NOT NULL;

ALTER TABLE public.competition_secrets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cs_secret_select ON public.competition_secrets;
CREATE POLICY cs_secret_select ON public.competition_secrets FOR SELECT
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.competitions c WHERE c.id = competition_id AND c.created_by = auth.uid())
  );
DROP POLICY IF EXISTS cs_secret_write ON public.competition_secrets;
CREATE POLICY cs_secret_write ON public.competition_secrets FOR ALL
  USING (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.competitions c WHERE c.id = competition_id AND c.created_by = auth.uid())
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.competitions c WHERE c.id = competition_id AND c.created_by = auth.uid())
  );

-- Trigger يضبط is_correct تلقائياً عند الإرسال
CREATE OR REPLACE FUNCTION public.evaluate_competition_submission()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _secret text;
BEGIN
  SELECT correct_answer INTO _secret FROM public.competition_secrets WHERE competition_id = NEW.competition_id;
  IF _secret IS NULL OR NEW.answer IS NULL THEN
    NEW.is_correct := false;
  ELSE
    NEW.is_correct := lower(trim(NEW.answer)) = lower(trim(_secret));
  END IF;
  RETURN NEW;
END;$$;

DROP TRIGGER IF EXISTS competition_submissions_evaluate ON public.competition_submissions;
CREATE TRIGGER competition_submissions_evaluate
BEFORE INSERT ON public.competition_submissions
FOR EACH ROW EXECUTE FUNCTION public.evaluate_competition_submission();

-- =============================================================
-- 6) تشديد سياسات SELECT على إجابات الطلاب والاختبارات
-- =============================================================
DROP POLICY IF EXISTS cs_select_all ON public.competition_submissions;
DROP POLICY IF EXISTS cs_select_own_or_teacher ON public.competition_submissions;
CREATE POLICY cs_select_own_or_teacher ON public.competition_submissions FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.competitions c WHERE c.id = competition_id AND c.created_by = auth.uid())
  );

DROP POLICY IF EXISTS asub_select ON public.assignment_submissions;
DROP POLICY IF EXISTS asub_select_own_or_teacher ON public.assignment_submissions;
CREATE POLICY asub_select_own_or_teacher ON public.assignment_submissions FOR SELECT
  USING (
    auth.uid() = student_id
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
    OR EXISTS (SELECT 1 FROM public.assignments a WHERE a.id = assignment_id AND a.teacher_id = auth.uid())
  );

DROP POLICY IF EXISTS qa_select ON public.quiz_attempts;
DROP POLICY IF EXISTS qa_select_own_or_teacher ON public.quiz_attempts;
CREATE POLICY qa_select_own_or_teacher ON public.quiz_attempts FOR SELECT
  USING (
    auth.uid() = user_id
    OR public.is_teacher(auth.uid())
  );

-- =============================================================
-- 7) الإشعارات: يمنع أي مستخدم من إرسال إشعار لشخص آخر
-- =============================================================
DROP POLICY IF EXISTS notif_insert_any ON public.notifications;
DROP POLICY IF EXISTS notif_insert_service ON public.notifications;
DROP POLICY IF EXISTS notif_insert_self_or_teacher ON public.notifications;
CREATE POLICY notif_insert_self_or_teacher ON public.notifications FOR INSERT
  WITH CHECK (
    auth.uid() = user_id
    OR public.is_teacher(auth.uid())
  );

-- =============================================================
-- 8) Storage: منع الرفع لأي مسار خارج مجلد المستخدم
-- =============================================================
DROP POLICY IF EXISTS "dm-images authed upload" ON storage.objects;
DROP POLICY IF EXISTS "dm_images_user_upload" ON storage.objects;
CREATE POLICY "dm_images_user_upload" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'dm-images'
    AND auth.uid() IS NOT NULL
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
DROP POLICY IF EXISTS "dm_images_user_delete" ON storage.objects;
CREATE POLICY "dm_images_user_delete" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'dm-images'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'::public.app_role))
  );

DROP POLICY IF EXISTS "competition_media_user_upload" ON storage.objects;
CREATE POLICY "competition_media_user_upload" ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'competition-media'
    AND auth.uid() IS NOT NULL
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
DROP POLICY IF EXISTS "competition_media_user_delete" ON storage.objects;
CREATE POLICY "competition_media_user_delete" ON storage.objects FOR DELETE
  USING (
    bucket_id = 'competition-media'
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'::public.app_role))
  );

-- =============================================================
-- 9) الصلاحيات
-- =============================================================
REVOKE EXECUTE ON FUNCTION public.protect_role_type() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.evaluate_competition_submission() FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_teacher_role(text) TO authenticated;

-- =============================================================
-- 10) سماح المعلم بقراءة بيانات الفصل (grade فقط) لطلابه المرتبطين به
-- =============================================================
DROP POLICY IF EXISTS pp_select_teacher_students ON public.profiles_private;
CREATE POLICY pp_select_teacher_students ON public.profiles_private FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = profiles_private.user_id AND p.teacher_id = auth.uid()
    )
  );


-- ========== security_fixes_v2 ==========
-- =============================================================
-- إصلاحات أمنية إضافية v2 — شغّليه في Supabase SQL Editor
-- =============================================================

-- 1) جعل bucket dm-images خاصاً
UPDATE storage.buckets SET public = false WHERE id = 'dm-images';

DROP POLICY IF EXISTS "dm-images public read" ON storage.objects;
DROP POLICY IF EXISTS "lh_dm_read" ON storage.objects;
DROP POLICY IF EXISTS "dm_images_authed_read" ON storage.objects;
CREATE POLICY "dm_images_authed_read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'dm-images');

-- 2) جدول أكواد الرتب السرية (تخزين hash فقط)
CREATE TABLE IF NOT EXISTS public.role_claim_codes (
  role public.app_role PRIMARY KEY,
  code_hash text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.role_claim_codes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.role_claim_codes FROM anon, authenticated;

INSERT INTO public.role_claim_codes (role, code_hash) VALUES
  ('admin'::public.app_role, encode(digest('PLEASE-ROTATE-ADMIN-' || gen_random_uuid()::text, 'sha256'), 'hex')),
  ('teacher'::public.app_role, encode(digest('PLEASE-ROTATE-TEACHER-' || gen_random_uuid()::text, 'sha256'), 'hex')),
  ('supervisor'::public.app_role, encode(digest('PLEASE-ROTATE-SUPERVISOR-' || gen_random_uuid()::text, 'sha256'), 'hex'))
ON CONFLICT (role) DO NOTHING;

CREATE OR REPLACE FUNCTION public.set_role_claim_code(_role public.app_role, _new_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'admin only';
  END IF;
  IF _new_code IS NULL OR length(_new_code) < 8 THEN
    RAISE EXCEPTION 'code must be at least 8 characters';
  END IF;
  INSERT INTO public.role_claim_codes (role, code_hash, updated_at)
    VALUES (_role, encode(digest(_new_code, 'sha256'), 'hex'), now())
  ON CONFLICT (role) DO UPDATE SET code_hash = EXCLUDED.code_hash, updated_at = now();
  RETURN true;
END;$$;
REVOKE EXECUTE ON FUNCTION public.set_role_claim_code(public.app_role, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_role_claim_code(public.app_role, text) TO authenticated;

-- 3) إعادة كتابة claim_*_role لمقارنة hash بدلاً من نص مكتوب
CREATE OR REPLACE FUNCTION public.claim_teacher_role(_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _stored text; _existing text;
BEGIN
  IF _uid IS NULL OR _code IS NULL THEN RETURN false; END IF;
  SELECT code_hash INTO _stored FROM public.role_claim_codes WHERE role = 'teacher'::public.app_role;
  IF _stored IS NULL OR encode(digest(_code, 'sha256'), 'hex') <> _stored THEN RETURN false; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'teacher'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  SELECT class_code INTO _existing FROM public.profiles WHERE id = _uid;
  UPDATE public.profiles SET role_type = 'teacher',
    class_code = COALESCE(_existing, public.generate_class_code()) WHERE id = _uid;
  RETURN true;
END;$$;

CREATE OR REPLACE FUNCTION public.claim_admin_role(_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _stored text;
BEGIN
  IF _uid IS NULL OR _code IS NULL THEN RETURN false; END IF;
  SELECT code_hash INTO _stored FROM public.role_claim_codes WHERE role = 'admin'::public.app_role;
  IF _stored IS NULL OR encode(digest(_code, 'sha256'), 'hex') <> _stored THEN RETURN false; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  RETURN true;
END;$$;

CREATE OR REPLACE FUNCTION public.claim_supervisor_role(_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _stored text;
BEGIN
  IF _uid IS NULL OR _code IS NULL THEN RETURN false; END IF;
  SELECT code_hash INTO _stored FROM public.role_claim_codes WHERE role = 'supervisor'::public.app_role;
  IF _stored IS NULL OR encode(digest(_code, 'sha256'), 'hex') <> _stored THEN RETURN false; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'supervisor'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  RETURN true;
END;$$;

GRANT EXECUTE ON FUNCTION public.claim_teacher_role(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_admin_role(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.claim_supervisor_role(text) TO authenticated;

-- بعد التشغيل: عيّن الأكواد الجديدة (من حساب أدمن):
-- SELECT public.set_role_claim_code('teacher', 'كودك-السري-الجديد');
