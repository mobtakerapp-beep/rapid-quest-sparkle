
-- 0) Allow 'admin' on profiles.role_type
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_type_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_type_check
  CHECK (role_type IS NULL OR role_type = ANY (ARRAY['teacher','student','parent','supervisor','admin']));

-- 1) Bypass-aware guard
CREATE OR REPLACE FUNCTION public.guard_profile_protected_cols()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF current_setting('app.bypass_profile_guard', true) = 'on' THEN
    RETURN NEW;
  END IF;
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    NEW.points := OLD.points;
    NEW.warning_count := OLD.warning_count;
    NEW.is_banned := OLD.is_banned;
  END IF;
  RETURN NEW;
END; $$;

-- 2) award_on_quiz with bypass
CREATE OR REPLACE FUNCTION public.award_on_quiz()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE cnt integer;
BEGIN
  SELECT COUNT(*) INTO cnt FROM public.quiz_attempts WHERE user_id = NEW.user_id;
  IF cnt >= 1 THEN
    INSERT INTO public.user_badges(user_id, badge_id) VALUES (NEW.user_id, 'quiz_starter')
      ON CONFLICT DO NOTHING;
  END IF;
  IF cnt >= 5 THEN
    INSERT INTO public.user_badges(user_id, badge_id) VALUES (NEW.user_id, 'quiz_master')
      ON CONFLICT DO NOTHING;
  END IF;
  PERFORM set_config('app.bypass_profile_guard', 'on', true);
  UPDATE public.profiles SET points = COALESCE(points, 0) + COALESCE(NEW.score, 0) WHERE id = NEW.user_id;
  PERFORM set_config('app.bypass_profile_guard', 'off', true);
  RETURN NEW;
END; $$;

-- 3) notify_new_certificate with bypass
CREATE OR REPLACE FUNCTION public.notify_new_certificate()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (NEW.student_id, 'certificate', 'حصلت على شهادة جديدة 🏆', NEW.title, '/badges');
  PERFORM set_config('app.bypass_profile_guard', 'on', true);
  UPDATE public.profiles SET points = COALESCE(points, 0) + 10 WHERE id = NEW.student_id;
  PERFORM set_config('app.bypass_profile_guard', 'off', true);
  RETURN NEW;
END; $$;

-- 4) claim_admin_role / claim_supervisor_role: also grant teacher capabilities
CREATE OR REPLACE FUNCTION public.claim_admin_role(_code text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF _code <> 'WUSTA-A-2026' THEN RETURN false; END IF;

  PERFORM set_config('app.bypass_profile_guard', 'on', true);
  INSERT INTO public.profiles (id, role_type, class_code)
  VALUES (_uid, 'admin', public.generate_class_code())
  ON CONFLICT (id) DO UPDATE SET
    role_type = 'admin',
    class_code = COALESCE(public.profiles.class_code, public.generate_class_code());
  PERFORM set_config('app.bypass_profile_guard', 'off', true);

  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'admin') ON CONFLICT (user_id, role) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'teacher') ON CONFLICT (user_id, role) DO NOTHING;
  RETURN true;
END; $$;

CREATE OR REPLACE FUNCTION public.claim_supervisor_role(_code text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF _code <> 'WUSTA-S-2026' THEN RETURN false; END IF;

  PERFORM set_config('app.bypass_profile_guard', 'on', true);
  INSERT INTO public.profiles (id, role_type, class_code)
  VALUES (_uid, 'supervisor', public.generate_class_code())
  ON CONFLICT (id) DO UPDATE SET
    role_type = 'supervisor',
    class_code = COALESCE(public.profiles.class_code, public.generate_class_code());
  PERFORM set_config('app.bypass_profile_guard', 'off', true);

  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'supervisor') ON CONFLICT (user_id, role) DO NOTHING;
  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'teacher') ON CONFLICT (user_id, role) DO NOTHING;
  RETURN true;
END; $$;

-- 5) Backfill class codes for existing admins/supervisors
DO $$
DECLARE r record;
BEGIN
  PERFORM set_config('app.bypass_profile_guard', 'on', true);
  FOR r IN SELECT id FROM public.profiles WHERE role_type IN ('admin','supervisor') AND class_code IS NULL LOOP
    UPDATE public.profiles SET class_code = public.generate_class_code() WHERE id = r.id;
  END LOOP;
  PERFORM set_config('app.bypass_profile_guard', 'off', true);
END $$;

-- 6) Ensure teacher app_role for all admins/supervisors
INSERT INTO public.user_roles (user_id, role)
SELECT p.id, 'teacher'::public.app_role
FROM public.profiles p
WHERE p.role_type IN ('admin','supervisor')
ON CONFLICT (user_id, role) DO NOTHING;

-- 7) Force-correct legacy profiles where user_roles says admin but role_type drifted
DO $$
BEGIN
  PERFORM set_config('app.bypass_profile_guard', 'on', true);
  UPDATE public.profiles p
    SET role_type = 'admin'
    WHERE EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = p.id AND ur.role = 'admin')
      AND COALESCE(p.role_type,'') <> 'admin';
  PERFORM set_config('app.bypass_profile_guard', 'off', true);
END $$;
