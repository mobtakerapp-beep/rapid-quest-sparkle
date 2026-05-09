
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
