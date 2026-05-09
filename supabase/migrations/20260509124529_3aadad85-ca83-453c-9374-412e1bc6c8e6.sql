
ALTER TABLE public.competition_submissions
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS link_url text;

ALTER TABLE public.gallery_contest_entries
  ALTER COLUMN media_url DROP NOT NULL;

ALTER TABLE public.user_badges
  ADD COLUMN IF NOT EXISTS awarded_by uuid;

ALTER TABLE public.badges
  ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT 'student';

CREATE TABLE IF NOT EXISTS public.competition_secrets (
  competition_id uuid PRIMARY KEY REFERENCES public.competitions(id) ON DELETE CASCADE,
  correct_answer text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.competition_secrets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cs_secrets_select" ON public.competition_secrets;
CREATE POLICY "cs_secrets_select" ON public.competition_secrets
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.competitions c WHERE c.id = competition_id AND c.created_by = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS "cs_secrets_insert" ON public.competition_secrets;
CREATE POLICY "cs_secrets_insert" ON public.competition_secrets
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.competitions c WHERE c.id = competition_id AND c.created_by = auth.uid())
  );

DROP POLICY IF EXISTS "cs_secrets_update" ON public.competition_secrets;
CREATE POLICY "cs_secrets_update" ON public.competition_secrets
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.competitions c WHERE c.id = competition_id AND c.created_by = auth.uid())
    OR public.has_role(auth.uid(), 'admin'::public.app_role)
  );

INSERT INTO storage.buckets (id, name, public)
VALUES ('competition-media', 'competition-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "comp_media_read" ON storage.objects;
CREATE POLICY "comp_media_read" ON storage.objects
  FOR SELECT USING (bucket_id = 'competition-media');

DROP POLICY IF EXISTS "comp_media_insert" ON storage.objects;
CREATE POLICY "comp_media_insert" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'competition-media' AND auth.uid()::text = (storage.foldername(name))[1]);
