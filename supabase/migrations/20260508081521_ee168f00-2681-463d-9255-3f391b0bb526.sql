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