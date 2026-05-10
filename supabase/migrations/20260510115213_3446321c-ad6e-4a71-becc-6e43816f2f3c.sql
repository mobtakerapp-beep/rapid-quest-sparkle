-- 1. Drop overly-permissive storage policies
DROP POLICY IF EXISTS lh_dm_upload ON storage.objects;
DROP POLICY IF EXISTS lh_cm_upload ON storage.objects;

-- 2. Drop reports impersonation policy
DROP POLICY IF EXISTS reports_insert_self ON public.reports;

-- 3. Hash teacher claim code; rotate plaintext
INSERT INTO public.role_claim_codes (role, code_hash, updated_at)
VALUES ('teacher'::public.app_role, encode(digest('WUSTA-T-2026','sha256'),'hex'), now())
ON CONFLICT (role) DO UPDATE SET code_hash = EXCLUDED.code_hash, updated_at = now();

CREATE OR REPLACE FUNCTION public.claim_teacher_role(_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid(); _stored text; _existing text;
BEGIN
  IF _uid IS NULL OR _code IS NULL THEN RETURN false; END IF;
  SELECT code_hash INTO _stored FROM public.role_claim_codes WHERE role = 'teacher'::public.app_role;
  IF _stored IS NULL OR encode(digest(_code,'sha256'),'hex') <> _stored THEN RETURN false; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'teacher'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  SELECT class_code INTO _existing FROM public.profiles WHERE id = _uid;
  PERFORM set_config('app.bypass_profile_guard','on',true);
  UPDATE public.profiles SET role_type = 'teacher',
    class_code = COALESCE(_existing, public.generate_class_code()) WHERE id = _uid;
  PERFORM set_config('app.bypass_profile_guard','off',true);
  RETURN true;
END;$function$;

-- 4. Restrict messages SELECT to authenticated users
DROP POLICY IF EXISTS messages_select ON public.messages;
DROP POLICY IF EXISTS messages_select_all ON public.messages;
CREATE POLICY messages_select ON public.messages
  FOR SELECT TO authenticated
  USING (true);