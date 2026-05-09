-- Ensure default badges used by triggers exist before inserting user_badges
INSERT INTO public.badges (id, name, description, icon, color) VALUES
  ('first_activity', 'أول نشاط', 'تم رفع أول نشاط معتمد', '🌟', 'blue'),
  ('five_activities', 'خمسة أنشطة', 'تم رفع خمسة أنشطة معتمدة', '🚀', 'emerald'),
  ('ten_activities', 'عشرة أنشطة', 'تم رفع عشرة أنشطة معتمدة', '🏆', 'amber'),
  ('competition_winner', 'فائز في المسابقة', 'تم اعتماد إجابة صحيحة في مسابقة', '👑', 'yellow')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color;

-- Give existing activated teachers a class code if missing
UPDATE public.profiles p
SET class_code = public.generate_class_code()
WHERE p.class_code IS NULL
  AND (
    p.role_type = 'teacher'
    OR public.has_role(p.id, 'teacher'::public.app_role)
    OR public.has_role(p.id, 'supervisor'::public.app_role)
    OR public.has_role(p.id, 'admin'::public.app_role)
  );

-- Keep teacher code generated automatically whenever a profile becomes teacher/supervisor
CREATE OR REPLACE FUNCTION public.ensure_teacher_class_code()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.class_code IS NULL AND NEW.role_type IN ('teacher', 'supervisor') THEN
    NEW.class_code := public.generate_class_code();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ensure_teacher_class_code ON public.profiles;
CREATE TRIGGER trg_ensure_teacher_class_code
BEFORE INSERT OR UPDATE OF role_type, class_code ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.ensure_teacher_class_code();

-- Make is_teacher depend on secure role claims, not editable profile text alone
CREATE OR REPLACE FUNCTION public.is_teacher(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
      OR public.has_role(_user_id, 'teacher'::public.app_role)
      OR public.has_role(_user_id, 'supervisor'::public.app_role)
$$;

-- Update teacher role claim to always create a class code
CREATE OR REPLACE FUNCTION public.claim_teacher_role(_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid UUID := auth.uid();
  _existing text;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF _code <> 'WUSTA-T-2026' THEN RETURN false; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'teacher'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  SELECT class_code INTO _existing FROM public.profiles WHERE id = _uid;
  UPDATE public.profiles
  SET role_type = 'teacher',
      class_code = COALESCE(_existing, public.generate_class_code())
  WHERE id = _uid;
  RETURN true;
END;
$$;

-- Keep supervisor/admin role_type aligned when special codes are used
CREATE OR REPLACE FUNCTION public.claim_admin_role(_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _uid UUID := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF _code <> 'WUSTA-A-2026' THEN RETURN false; END IF;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'admin'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  UPDATE public.profiles
  SET role_type = COALESCE(role_type, 'supervisor'),
      class_code = COALESCE(class_code, public.generate_class_code())
  WHERE id = _uid;
  RETURN true;
END;
$$;