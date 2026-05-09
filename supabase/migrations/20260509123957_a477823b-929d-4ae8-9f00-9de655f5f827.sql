DO $$ BEGIN
  BEGIN ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'teacher'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'supervisor'; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

ALTER TABLE public.quiz_attempts ADD COLUMN IF NOT EXISTS details jsonb;

CREATE OR REPLACE FUNCTION public.join_teacher_by_code(_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _tid uuid;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  SELECT id INTO _tid FROM public.profiles WHERE class_code = upper(trim(_code)) AND role_type='teacher' LIMIT 1;
  IF _tid IS NULL THEN RETURN false; END IF;
  UPDATE public.profiles SET teacher_id = _tid WHERE id = _uid;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.add_student_by_email(_email text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _sid uuid;
BEGIN
  IF _uid IS NULL OR NOT public.is_teacher(_uid) THEN RETURN false; END IF;
  SELECT id INTO _sid FROM auth.users WHERE lower(email)=lower(trim(_email)) LIMIT 1;
  IF _sid IS NULL THEN RETURN false; END IF;
  UPDATE public.profiles SET teacher_id=_uid WHERE id=_sid;
  RETURN true;
END; $$;