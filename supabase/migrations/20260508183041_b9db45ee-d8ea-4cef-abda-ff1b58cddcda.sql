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