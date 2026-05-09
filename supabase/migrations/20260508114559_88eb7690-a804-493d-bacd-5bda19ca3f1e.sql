CREATE OR REPLACE FUNCTION public.protect_profile_role_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.role_type = 'teacher' AND NOT (
    public.has_role(NEW.id, 'teacher'::public.app_role)
    OR public.has_role(NEW.id, 'admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'ROLE_CODE_REQUIRED: يجب إدخال كود المعلم أولاً';
  END IF;

  IF NEW.role_type = 'supervisor' AND NOT (
    public.has_role(NEW.id, 'supervisor'::public.app_role)
    OR public.has_role(NEW.id, 'admin'::public.app_role)
  ) THEN
    RAISE EXCEPTION 'ROLE_CODE_REQUIRED: يجب إدخال كود المشرف أولاً';
  END IF;

  IF NEW.role_type IN ('teacher', 'supervisor') AND NEW.class_code IS NULL THEN
    NEW.class_code := public.generate_class_code();
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_protect_profile_role_type ON public.profiles;
CREATE TRIGGER trg_protect_profile_role_type
BEFORE INSERT OR UPDATE OF role_type, class_code ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_role_type();