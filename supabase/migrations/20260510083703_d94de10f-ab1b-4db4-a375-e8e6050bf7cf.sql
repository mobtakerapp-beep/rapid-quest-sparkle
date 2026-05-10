
-- 1) Competition correct answers: scrub from questions JSONB and mirror into competition_secrets

CREATE OR REPLACE FUNCTION public.scrub_competition_questions()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _q jsonb;
  _scrubbed jsonb := '[]'::jsonb;
  _elem jsonb;
  _first_idx integer;
  _first_ans text;
  _has_first boolean := false;
BEGIN
  IF NEW.questions IS NULL THEN RETURN NEW; END IF;
  FOR _elem IN SELECT value FROM jsonb_array_elements(NEW.questions) LOOP
    IF NOT _has_first THEN
      _first_idx := NULLIF(_elem->>'correct_index','')::integer;
      _first_ans := _elem->>'correct_answer';
      _has_first := true;
    END IF;
    _scrubbed := _scrubbed || jsonb_build_array(_elem - 'correct_index' - 'correct_answer');
  END LOOP;
  NEW.questions := _scrubbed;

  -- Mirror first question's answer into competition_secrets for legacy single-answer flows
  IF TG_OP = 'INSERT' AND (_first_idx IS NOT NULL OR _first_ans IS NOT NULL) THEN
    INSERT INTO public.competition_secrets (competition_id, correct_answer, correct_index)
    VALUES (NEW.id, _first_ans, _first_idx)
    ON CONFLICT (competition_id) DO NOTHING;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS scrub_competition_questions_ins ON public.competitions;
DROP TRIGGER IF EXISTS scrub_competition_questions_upd ON public.competitions;
CREATE TRIGGER scrub_competition_questions_ins
  BEFORE INSERT ON public.competitions
  FOR EACH ROW EXECUTE FUNCTION public.scrub_competition_questions();
CREATE TRIGGER scrub_competition_questions_upd
  BEFORE UPDATE OF questions ON public.competitions
  FOR EACH ROW EXECUTE FUNCTION public.scrub_competition_questions();

-- Backfill: scrub existing rows. We need to also persist their answers privately first.
DO $$
DECLARE r record; q jsonb; elem jsonb; idx integer; ans text; first_done boolean;
BEGIN
  FOR r IN SELECT id, questions FROM public.competitions WHERE questions IS NOT NULL LOOP
    first_done := false;
    FOR elem IN SELECT value FROM jsonb_array_elements(r.questions) LOOP
      IF NOT first_done THEN
        idx := NULLIF(elem->>'correct_index','')::integer;
        ans := elem->>'correct_answer';
        IF idx IS NOT NULL OR ans IS NOT NULL THEN
          INSERT INTO public.competition_secrets (competition_id, correct_answer, correct_index)
          VALUES (r.id, ans, idx)
          ON CONFLICT (competition_id) DO NOTHING;
        END IF;
        first_done := true;
      END IF;
    END LOOP;
    SELECT COALESCE(jsonb_agg(e - 'correct_index' - 'correct_answer'), '[]'::jsonb)
      INTO q FROM jsonb_array_elements(r.questions) e;
    UPDATE public.competitions SET questions = q WHERE id = r.id;
  END LOOP;
END $$;

-- 2) DM images: drop overly broad authenticated read policy
DROP POLICY IF EXISTS dm_images_authed_read ON storage.objects;

-- 3) Role claim codes: move hardcoded admin/supervisor codes to hashed table, keep codes the same
INSERT INTO public.role_claim_codes (role, code_hash, updated_at)
VALUES ('admin'::public.app_role, encode(digest('WUSTA-A-2026','sha256'),'hex'), now())
ON CONFLICT (role) DO UPDATE SET code_hash = EXCLUDED.code_hash, updated_at = now();

INSERT INTO public.role_claim_codes (role, code_hash, updated_at)
VALUES ('supervisor'::public.app_role, encode(digest('WUSTA-S-2026','sha256'),'hex'), now())
ON CONFLICT (role) DO UPDATE SET code_hash = EXCLUDED.code_hash, updated_at = now();

CREATE OR REPLACE FUNCTION public.claim_admin_role(_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid(); _stored text;
BEGIN
  IF _uid IS NULL OR _code IS NULL THEN RETURN false; END IF;
  SELECT code_hash INTO _stored FROM public.role_claim_codes WHERE role = 'admin'::public.app_role;
  IF _stored IS NULL OR encode(digest(_code,'sha256'),'hex') <> _stored THEN RETURN false; END IF;

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
END $$;

CREATE OR REPLACE FUNCTION public.claim_supervisor_role(_code text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _uid uuid := auth.uid(); _stored text;
BEGIN
  IF _uid IS NULL OR _code IS NULL THEN RETURN false; END IF;
  SELECT code_hash INTO _stored FROM public.role_claim_codes WHERE role = 'supervisor'::public.app_role;
  IF _stored IS NULL OR encode(digest(_code,'sha256'),'hex') <> _stored THEN RETURN false; END IF;

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
END $$;

-- 4) Notifications: tighten teacher inserts to their own students
DROP POLICY IF EXISTS notif_insert_self_or_teacher ON public.notifications;
DROP POLICY IF EXISTS notif_insert ON public.notifications;
CREATE POLICY notif_insert_self_or_own_student ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    OR has_role(auth.uid(), 'admin'::public.app_role)
    OR (
      is_teacher(auth.uid())
      AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = notifications.user_id AND p.teacher_id = auth.uid())
    )
  );
