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
