-- Ensure required public storage buckets exist and remain public
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
ON CONFLICT (id) DO UPDATE SET public = EXCLUDED.public;

-- Storage policies for all app upload buckets
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT polname FROM pg_policy
    WHERE polrelid = 'storage.objects'::regclass
      AND polname LIKE 'wusta_%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', r.polname);
  END LOOP;
END $$;

CREATE POLICY wusta_public_bucket_read ON storage.objects
  FOR SELECT TO public
  USING (bucket_id IN ('chat-images','activity-files','gallery-media','avatars','assignment-files','dm-images','certificates','competition-media','quiz-images'));

CREATE POLICY wusta_user_folder_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('chat-images','gallery-media','avatars','assignment-files','dm-images','competition-media')
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY wusta_teacher_folder_upload ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id IN ('activity-files','certificates','quiz-images')
    AND public.is_teacher(auth.uid())
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY wusta_user_folder_update ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id IN ('chat-images','gallery-media','avatars','assignment-files','dm-images','competition-media')
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id IN ('chat-images','gallery-media','avatars','assignment-files','dm-images','competition-media')
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY wusta_user_folder_delete ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id IN ('chat-images','gallery-media','avatars','assignment-files','dm-images','competition-media','activity-files','certificates','quiz-images')
    AND (auth.uid()::text = (storage.foldername(name))[1] OR public.has_role(auth.uid(), 'admin'::public.app_role))
  );

-- Private profile details used for class/grade without exposing extra fields publicly
CREATE TABLE IF NOT EXISTS public.profiles_private (
  user_id uuid PRIMARY KEY,
  phone text,
  grade text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles_private ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_private_select_own ON public.profiles_private;
DROP POLICY IF EXISTS profiles_private_select_teacher_students ON public.profiles_private;
DROP POLICY IF EXISTS profiles_private_insert_own ON public.profiles_private;
DROP POLICY IF EXISTS profiles_private_update_own ON public.profiles_private;

CREATE POLICY profiles_private_select_own ON public.profiles_private
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE POLICY profiles_private_select_teacher_students ON public.profiles_private
  FOR SELECT TO authenticated
  USING (
    public.is_teacher(auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = profiles_private.user_id
        AND p.teacher_id = auth.uid()
    )
  );

CREATE POLICY profiles_private_insert_own ON public.profiles_private
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY profiles_private_update_own ON public.profiles_private
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

CREATE OR REPLACE FUNCTION public.touch_profiles_private_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_profiles_private_touch ON public.profiles_private;
CREATE TRIGGER trg_profiles_private_touch
  BEFORE UPDATE ON public.profiles_private
  FOR EACH ROW EXECUTE FUNCTION public.touch_profiles_private_updated_at();

-- User blocks for private messages
CREATE TABLE IF NOT EXISTS public.user_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL,
  blocked_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (blocker_id, blocked_id)
);
ALTER TABLE public.user_blocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS blocks_select_own ON public.user_blocks;
DROP POLICY IF EXISTS blocks_insert_own ON public.user_blocks;
DROP POLICY IF EXISTS blocks_delete_own ON public.user_blocks;
DROP POLICY IF EXISTS "blocks_select_own" ON public.user_blocks;
DROP POLICY IF EXISTS "blocks_insert_own" ON public.user_blocks;
DROP POLICY IF EXISTS "blocks_delete_own" ON public.user_blocks;

CREATE POLICY blocks_select_own ON public.user_blocks
  FOR SELECT TO authenticated
  USING (auth.uid() = blocker_id);

CREATE POLICY blocks_insert_own ON public.user_blocks
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = blocker_id AND blocker_id <> blocked_id);

CREATE POLICY blocks_delete_own ON public.user_blocks
  FOR DELETE TO authenticated
  USING (auth.uid() = blocker_id);

CREATE OR REPLACE FUNCTION public.is_blocked(_a uuid, _b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_blocks
    WHERE (blocker_id = _a AND blocked_id = _b)
       OR (blocker_id = _b AND blocked_id = _a)
  );
$$;

-- Reports can optionally point to a reported user
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS reported_user_id uuid;

-- Assistant image usage table
CREATE TABLE IF NOT EXISTS public.ai_image_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_image_usage ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS ai_image_usage_user_created_idx ON public.ai_image_usage(user_id, created_at DESC);

DROP POLICY IF EXISTS ai_image_usage_select_own ON public.ai_image_usage;
DROP POLICY IF EXISTS ai_image_usage_insert_own ON public.ai_image_usage;
CREATE POLICY ai_image_usage_select_own ON public.ai_image_usage
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY ai_image_usage_insert_own ON public.ai_image_usage
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- Secure role checks rely on user_roles, not editable profile fields
CREATE OR REPLACE FUNCTION public.is_teacher(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
      OR public.has_role(_user_id, 'teacher'::public.app_role)
      OR public.has_role(_user_id, 'supervisor'::public.app_role)
$$;

CREATE OR REPLACE FUNCTION public.claim_admin_role(_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF _code <> 'WUSTA-A-2026' THEN RETURN false; END IF;

  INSERT INTO public.profiles (id, role_type)
  VALUES (_uid, 'supervisor')
  ON CONFLICT (id) DO UPDATE SET role_type = COALESCE(public.profiles.role_type, 'supervisor');

  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_supervisor_role(_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF _code <> 'WUSTA-S-2026' THEN RETURN false; END IF;

  INSERT INTO public.profiles (id, role_type)
  VALUES (_uid, 'supervisor')
  ON CONFLICT (id) DO UPDATE SET role_type = 'supervisor';

  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'supervisor')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN true;
END;
$$;

CREATE OR REPLACE FUNCTION public.claim_teacher_role(_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF _code <> 'WUSTA-T-2026' THEN RETURN false; END IF;

  INSERT INTO public.profiles (id, role_type, class_code)
  VALUES (_uid, 'teacher', public.generate_class_code())
  ON CONFLICT (id) DO UPDATE SET
    role_type = 'teacher',
    class_code = COALESCE(public.profiles.class_code, public.generate_class_code());

  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'teacher')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN true;
END;
$$;

-- Backfill secure roles for existing elevated profiles created before this repair
INSERT INTO public.user_roles (user_id, role)
SELECT id, 'teacher'::public.app_role
FROM public.profiles
WHERE role_type = 'teacher'
ON CONFLICT (user_id, role) DO NOTHING;

INSERT INTO public.user_roles (user_id, role)
SELECT id, 'supervisor'::public.app_role
FROM public.profiles
WHERE role_type = 'supervisor'
ON CONFLICT (user_id, role) DO NOTHING;

UPDATE public.profiles
SET class_code = public.generate_class_code()
WHERE role_type = 'teacher' AND class_code IS NULL;

-- Direct message policies with block checks
DROP POLICY IF EXISTS dm_insert ON public.direct_messages;
DROP POLICY IF EXISTS dm_insert_own ON public.direct_messages;
DROP POLICY IF EXISTS dm_insert_not_blocked ON public.direct_messages;
DROP POLICY IF EXISTS "dm_insert_not_blocked" ON public.direct_messages;

CREATE POLICY dm_insert_not_blocked ON public.direct_messages
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = sender_id
    AND NOT public.is_banned(auth.uid())
    AND NOT public.is_blocked(sender_id, receiver_id)
  );

-- Teacher badge creation and badge granting
DROP POLICY IF EXISTS badges_insert_teacher ON public.badges;
CREATE POLICY badges_insert_teacher ON public.badges
  FOR INSERT TO authenticated
  WITH CHECK (public.is_teacher(auth.uid()));

DROP POLICY IF EXISTS ub_insert ON public.user_badges;
DROP POLICY IF EXISTS ub_insert_self_or_teacher ON public.user_badges;
CREATE POLICY ub_insert_self_or_teacher ON public.user_badges
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.is_teacher(auth.uid()));

-- Quiz helper functions used by the app
ALTER TABLE public.quiz_attempts ADD COLUMN IF NOT EXISTS details jsonb;
CREATE UNIQUE INDEX IF NOT EXISTS quiz_attempts_once_idx ON public.quiz_attempts(quiz_id, user_id);

CREATE OR REPLACE FUNCTION public.list_quizzes()
RETURNS TABLE (
  id uuid,
  title text,
  subject text,
  created_by uuid,
  question_count integer,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT q.id, q.title, q.subject, q.created_by,
         COALESCE(jsonb_array_length(q.questions), 0)::integer AS question_count,
         q.created_at
  FROM public.quizzes q
  ORDER BY q.created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.list_quizzes() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_quiz_for_attempt(_quiz_id uuid)
RETURNS TABLE (
  id uuid,
  title text,
  subject text,
  created_by uuid,
  questions jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _q public.quizzes%ROWTYPE;
  _can_see_answers boolean;
BEGIN
  IF _uid IS NULL THEN
    RETURN;
  END IF;

  SELECT * INTO _q FROM public.quizzes WHERE quizzes.id = _quiz_id;
  IF NOT FOUND THEN
    RETURN;
  END IF;

  _can_see_answers := (_q.created_by = _uid) OR public.is_teacher(_uid);

  id := _q.id;
  title := _q.title;
  subject := _q.subject;
  created_by := _q.created_by;
  IF _can_see_answers THEN
    questions := _q.questions;
  ELSE
    SELECT COALESCE(jsonb_agg(elem - 'correct' ORDER BY ord), '[]'::jsonb)
    INTO questions
    FROM jsonb_array_elements(_q.questions) WITH ORDINALITY AS x(elem, ord);
  END IF;
  RETURN NEXT;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_quiz_for_attempt(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.submit_quiz_attempt(_quiz_id uuid, _answers jsonb DEFAULT '{}'::jsonb, _essays jsonb DEFAULT '{}'::jsonb)
RETURNS TABLE (score integer, total integer, details jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _questions jsonb;
  _item jsonb;
  _i integer := 0;
  _type text;
  _selected integer;
  _correct integer;
  _points integer;
  _essay text;
  _detail jsonb := '[]'::jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'يجب تسجيل الدخول';
  END IF;

  IF EXISTS (SELECT 1 FROM public.quiz_attempts WHERE quiz_id = _quiz_id AND user_id = _uid) THEN
    RAISE EXCEPTION 'لقد حليت هذا الاختبار من قبل';
  END IF;

  SELECT q.questions INTO _questions FROM public.quizzes q WHERE q.id = _quiz_id;
  IF _questions IS NULL THEN
    RAISE EXCEPTION 'الاختبار غير موجود';
  END IF;

  score := 0;
  total := COALESCE(jsonb_array_length(_questions), 0);

  FOR _item IN SELECT value FROM jsonb_array_elements(_questions) LOOP
    _type := COALESCE(_item->>'type', 'mc');

    IF _type = 'essay' THEN
      _essay := COALESCE(_essays->>_i::text, '');
      _detail := _detail || jsonb_build_array(jsonb_build_object(
        'i', _i,
        'type', 'essay',
        'question', _item->>'question',
        'essay', _essay,
        'points', NULL
      ));
    ELSE
      _selected := NULL;
      IF (_answers ? _i::text) THEN
        _selected := (_answers->>_i::text)::integer;
      END IF;
      _correct := COALESCE((_item->>'correct')::integer, -1);
      _points := CASE WHEN _selected = _correct THEN 1 ELSE 0 END;
      score := score + _points;
      _detail := _detail || jsonb_build_array(jsonb_build_object(
        'i', _i,
        'type', 'mc',
        'question', _item->>'question',
        'selected', _selected,
        'correct', _correct,
        'points', _points
      ));
    END IF;

    _i := _i + 1;
  END LOOP;

  details := _detail;

  INSERT INTO public.quiz_attempts (quiz_id, user_id, score, total, details)
  VALUES (_quiz_id, _uid, score, total, details);

  RETURN NEXT;
END;
$$;
GRANT EXECUTE ON FUNCTION public.submit_quiz_attempt(uuid, jsonb, jsonb) TO authenticated;

-- Badge catalog required by achievements and teacher panel
INSERT INTO public.badges (id, name, description, icon, color, audience) VALUES
  ('first_activity', 'أول نشاط', 'رفعت أول نشاط', '✨', 'amber', 'student'),
  ('five_activities', '5 أنشطة', 'وصلت إلى 5 أنشطة', '🔥', 'amber', 'student'),
  ('ten_activities', '10 أنشطة', '10 أنشطة وأكثر', '⚡', 'amber', 'student'),
  ('first_comment', 'أول تعليق', 'شاركت بأول تعليق', '💬', 'cyan', 'student'),
  ('quiz_starter', 'بداية موفقة', 'حللت أول اختبار', '🎯', 'rose', 'student'),
  ('quiz_master', 'بطل الاختبارات', '5 اختبارات بنجاح', '🏆', 'rose', 'student'),
  ('competition_winner', 'بطل المسابقات', 'إجابة صحيحة في مسابقة', '🥇', 'amber', 'student'),
  ('creative', 'مبدع', 'شاركت في معرض الإبداع', '🎨', 'violet', 'student'),
  ('honor_student', 'نجم الأسبوع', 'الأعلى نقاطاً هذا الأسبوع', '🎖️', 'amber', 'student'),
  ('certificate_holder', 'حامل الشهادة', 'حصلت على شهادة تقدير', '🏅', 'emerald', 'student'),
  ('helpful_friend', 'الصديق المساعد', 'تفاعل إيجابي مع الزملاء', '🤝', 'cyan', 'student'),
  ('top10', 'ضمن العشرة الأوائل', 'دخلت قائمة العشرة الأوائل', '🌟', 'violet', 'student'),
  ('excellence', 'شارة التميز', 'للطالب المتميز', '🌟', 'amber', 'student'),
  ('distinction', 'شارة التفوق', 'للطالب المتفوق دراسياً', '🏆', 'violet', 'student'),
  ('participation', 'شارة المشاركة', 'للطالب الفعال', '🙋', 'cyan', 'student'),
  ('creativity', 'شارة الإبداع', 'للطالب المبدع', '🎨', 'rose', 'student'),
  ('perseverance', 'شارة المثابرة', 'للطالب المثابر', '💪', 'emerald', 'student'),
  ('leadership', 'شارة القيادة', 'للطالب القائد', '👑', 'amber', 'student'),
  ('helpful', 'شارة المساعد', 'للطالب المساعد لزملائه', '🤝', 'cyan', 'student'),
  ('first_quiz_made', 'أول اختبار', 'أنشأت أول اختبار', '📝', 'emerald', 'teacher'),
  ('first_competition', 'أول مسابقة', 'أنشأت أول مسابقة', '🎯', 'amber', 'teacher'),
  ('first_assignment', 'أول واجب', 'أنشأت أول واجب', '📚', 'cyan', 'teacher'),
  ('certificate_giver', 'مانح الشهادات', 'منحت شهادة لطالب', '🏅', 'violet', 'teacher'),
  ('top_teacher', 'المعلم المتميز', 'الأعلى نقاطاً هذا الأسبوع', '👑', 'amber', 'teacher'),
  ('class_builder', 'باني الفصل', 'أضفت 5 طلاب لفصلك', '🏗️', 'emerald', 'teacher'),
  ('active_teacher', 'المعلم النشط', 'مشاركات متعددة في المنصة', '⚡', 'rose', 'teacher'),
  ('teacher_excellence', 'معلم متميز', 'للمعلم المتميز', '🏅', 'amber', 'teacher'),
  ('teacher_innovation', 'معلم مبدع', 'للمعلم المبدع في طرح الأنشطة', '💡', 'violet', 'teacher'),
  ('teacher_dedication', 'معلم مخلص', 'للمعلم المخلص في عمله', '💎', 'cyan', 'teacher'),
  ('teacher_of_week', 'معلم الأسبوع', 'الأعلى نشاطاً هذا الأسبوع', '🌠', 'rose', 'teacher')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  audience = EXCLUDED.audience;

-- Notification and achievement triggers
CREATE OR REPLACE FUNCTION public.notify_new_dm()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE sname text;
BEGIN
  SELECT display_name INTO sname FROM public.profiles WHERE id = NEW.sender_id;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (NEW.receiver_id, 'dm', 'رسالة خاصة من ' || COALESCE(sname, 'مستخدم'), left(COALESCE(NEW.content, '📷 صورة'), 80), '/messages?with=' || NEW.sender_id::text);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_notify_dm ON public.direct_messages;
CREATE TRIGGER trg_notify_dm AFTER INSERT ON public.direct_messages
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_dm();

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
DROP TRIGGER IF EXISTS trg_new_badge ON public.user_badges;
CREATE TRIGGER trg_new_badge AFTER INSERT ON public.user_badges
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_badge();

CREATE OR REPLACE FUNCTION public.notify_new_certificate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (NEW.student_id, 'certificate', 'حصلت على شهادة جديدة 🏆', NEW.title, '/badges');
  UPDATE public.profiles SET points = COALESCE(points, 0) + 10 WHERE id = NEW.student_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS trg_new_certificate ON public.certificates;
CREATE TRIGGER trg_new_certificate AFTER INSERT ON public.certificates
  FOR EACH ROW EXECUTE FUNCTION public.notify_new_certificate();

CREATE OR REPLACE FUNCTION public.award_on_certificate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_badges(user_id, badge_id, awarded_by) VALUES (NEW.student_id, 'certificate_holder', NEW.teacher_id);
  INSERT INTO public.user_badges(user_id, badge_id, awarded_by) VALUES (NEW.teacher_id, 'certificate_giver', NEW.teacher_id);
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS award_on_certificate_t ON public.certificates;
CREATE TRIGGER award_on_certificate_t AFTER INSERT ON public.certificates
  FOR EACH ROW EXECUTE FUNCTION public.award_on_certificate();

CREATE OR REPLACE FUNCTION public.award_on_quiz()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE cnt integer;
BEGIN
  SELECT COUNT(*) INTO cnt FROM public.quiz_attempts WHERE user_id = NEW.user_id;
  IF cnt >= 1 THEN
    INSERT INTO public.user_badges(user_id, badge_id) VALUES (NEW.user_id, 'quiz_starter');
  END IF;
  IF cnt >= 5 THEN
    INSERT INTO public.user_badges(user_id, badge_id) VALUES (NEW.user_id, 'quiz_master');
  END IF;
  UPDATE public.profiles SET points = COALESCE(points, 0) + COALESCE(NEW.score, 0) WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS award_on_quiz_t ON public.quiz_attempts;
CREATE TRIGGER award_on_quiz_t AFTER INSERT ON public.quiz_attempts
  FOR EACH ROW EXECUTE FUNCTION public.award_on_quiz();

CREATE OR REPLACE FUNCTION public.award_teacher_first_quiz()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.user_badges(user_id, badge_id) VALUES (NEW.created_by, 'first_quiz_made');
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS award_teacher_first_quiz_t ON public.quizzes;
CREATE TRIGGER award_teacher_first_quiz_t AFTER INSERT ON public.quizzes
  FOR EACH ROW EXECUTE FUNCTION public.award_teacher_first_quiz();

DO $$
BEGIN
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER PUBLICATION supabase_realtime ADD TABLE public.messages; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;