
CREATE OR REPLACE FUNCTION public.claim_admin_role(_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions'
AS $$
DECLARE _uid uuid := auth.uid(); _stored text;
BEGIN
  IF _uid IS NULL OR _code IS NULL THEN RETURN false; END IF;
  SELECT code_hash INTO _stored FROM public.role_claim_codes WHERE role = 'admin'::public.app_role;
  IF _stored IS NULL OR encode(extensions.digest(_code,'sha256'),'hex') <> _stored THEN RETURN false; END IF;
  PERFORM set_config('app.bypass_profile_guard', 'on', true);
  INSERT INTO public.profiles (id, role_type, class_code)
  VALUES (_uid, 'admin', public.generate_class_code())
  ON CONFLICT (id) DO UPDATE SET role_type='admin',
    class_code = COALESCE(public.profiles.class_code, public.generate_class_code());
  PERFORM set_config('app.bypass_profile_guard','off', true);
  INSERT INTO public.user_roles(user_id,role) VALUES(_uid,'admin') ON CONFLICT DO NOTHING;
  INSERT INTO public.user_roles(user_id,role) VALUES(_uid,'teacher') ON CONFLICT DO NOTHING;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.claim_supervisor_role(_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions'
AS $$
DECLARE _uid uuid := auth.uid(); _stored text;
BEGIN
  IF _uid IS NULL OR _code IS NULL THEN RETURN false; END IF;
  SELECT code_hash INTO _stored FROM public.role_claim_codes WHERE role='supervisor'::public.app_role;
  IF _stored IS NULL OR encode(extensions.digest(_code,'sha256'),'hex') <> _stored THEN RETURN false; END IF;
  PERFORM set_config('app.bypass_profile_guard','on',true);
  INSERT INTO public.profiles(id, role_type, class_code)
  VALUES (_uid,'supervisor', public.generate_class_code())
  ON CONFLICT (id) DO UPDATE SET role_type='supervisor',
    class_code=COALESCE(public.profiles.class_code, public.generate_class_code());
  PERFORM set_config('app.bypass_profile_guard','off',true);
  INSERT INTO public.user_roles(user_id,role) VALUES(_uid,'supervisor') ON CONFLICT DO NOTHING;
  INSERT INTO public.user_roles(user_id,role) VALUES(_uid,'teacher') ON CONFLICT DO NOTHING;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION public.claim_teacher_role(_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public','extensions'
AS $$
DECLARE _uid uuid := auth.uid(); _stored text; _existing text;
BEGIN
  IF _uid IS NULL OR _code IS NULL THEN RETURN false; END IF;
  SELECT code_hash INTO _stored FROM public.role_claim_codes WHERE role='teacher'::public.app_role;
  IF _stored IS NULL OR encode(extensions.digest(_code,'sha256'),'hex') <> _stored THEN RETURN false; END IF;
  INSERT INTO public.user_roles(user_id,role) VALUES(_uid,'teacher'::public.app_role) ON CONFLICT DO NOTHING;
  SELECT class_code INTO _existing FROM public.profiles WHERE id=_uid;
  PERFORM set_config('app.bypass_profile_guard','on',true);
  UPDATE public.profiles SET role_type='teacher',
    class_code = COALESCE(_existing, public.generate_class_code()) WHERE id=_uid;
  PERFORM set_config('app.bypass_profile_guard','off',true);
  RETURN true;
END $$;
