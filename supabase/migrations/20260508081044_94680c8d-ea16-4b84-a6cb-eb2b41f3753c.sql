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