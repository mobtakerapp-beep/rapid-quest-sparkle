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