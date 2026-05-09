
CREATE OR REPLACE FUNCTION public.claim_admin_role(_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF _code <> 'WUSTA-A-2026' THEN RETURN false; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.claim_teacher_role(_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF _code <> 'WUSTA-T-2026' THEN RETURN false; END IF;
  INSERT INTO public.profiles (id, role_type) VALUES (_uid, 'teacher')
    ON CONFLICT (id) DO UPDATE SET role_type = 'teacher';
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id=_uid AND class_code IS NOT NULL) THEN
    UPDATE public.profiles SET class_code = public.generate_class_code() WHERE id=_uid AND class_code IS NULL;
  END IF;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.claim_supervisor_role(_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF _code <> 'WUSTA-S-2026' THEN RETURN false; END IF;
  INSERT INTO public.profiles (id, role_type) VALUES (_uid, 'supervisor')
    ON CONFLICT (id) DO UPDATE SET role_type = 'supervisor';
  RETURN true;
END; $$;
