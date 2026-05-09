
-- 1) reports: add missing columns
ALTER TABLE public.reports
  ADD COLUMN IF NOT EXISTS target_id text,
  ADD COLUMN IF NOT EXISTS target_kind text;

-- 2) Remove dm-images from broad public bucket read
DROP POLICY IF EXISTS wusta_public_bucket_read ON storage.objects;
CREATE POLICY wusta_public_bucket_read ON storage.objects
  FOR SELECT
  USING (bucket_id = ANY (ARRAY[
    'chat-images','activity-files','gallery-media','avatars',
    'assignment-files','certificates','competition-media','quiz-images'
  ]));

-- 3) Enable realtime
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.messages REPLICA IDENTITY FULL;
ALTER TABLE public.direct_messages REPLICA IDENTITY FULL;
ALTER TABLE public.gallery_comments REPLICA IDENTITY FULL;
ALTER TABLE public.quiz_attempts REPLICA IDENTITY FULL;

DO $$
BEGIN
  PERFORM 1 FROM pg_publication WHERE pubname = 'supabase_realtime';
  IF NOT FOUND THEN
    CREATE PUBLICATION supabase_realtime;
  END IF;
END $$;

ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.gallery_comments;
ALTER PUBLICATION supabase_realtime ADD TABLE public.quiz_attempts;

-- 4) claim_admin_role: label as 'admin' on profile
CREATE OR REPLACE FUNCTION public.claim_admin_role(_code text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE _uid uuid := auth.uid();
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  IF _code <> 'WUSTA-A-2026' THEN RETURN false; END IF;

  INSERT INTO public.profiles (id, role_type)
  VALUES (_uid, 'admin')
  ON CONFLICT (id) DO UPDATE SET role_type = 'admin';

  INSERT INTO public.user_roles (user_id, role) VALUES (_uid, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  RETURN true;
END;
$function$;

-- 5) Auto-grade competition submissions against competition_secrets
CREATE OR REPLACE FUNCTION public.autograde_competition_submission()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $$
DECLARE _ans text;
BEGIN
  SELECT correct_answer INTO _ans FROM public.competition_secrets WHERE competition_id = NEW.competition_id;
  IF _ans IS NOT NULL AND NEW.answer IS NOT NULL
     AND lower(btrim(NEW.answer)) = lower(btrim(_ans)) THEN
    NEW.is_correct := true;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_autograde_competition_submission ON public.competition_submissions;
CREATE TRIGGER trg_autograde_competition_submission
  BEFORE INSERT ON public.competition_submissions
  FOR EACH ROW EXECUTE FUNCTION public.autograde_competition_submission();
