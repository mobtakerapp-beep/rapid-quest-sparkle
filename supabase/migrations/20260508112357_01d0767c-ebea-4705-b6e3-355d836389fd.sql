
-- 1) DM image attachments
ALTER TABLE public.direct_messages ADD COLUMN IF NOT EXISTS image_url text;

-- 2) Certificates
CREATE TABLE IF NOT EXISTS public.certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  teacher_id uuid NOT NULL,
  student_id uuid NOT NULL,
  title text NOT NULL,
  body text,
  image_url text,
  bg text DEFAULT 'gold',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY certificates_select ON public.certificates FOR SELECT USING (
  auth.uid() = student_id OR auth.uid() = teacher_id OR public.has_role(auth.uid(), 'admin'::public.app_role)
);
CREATE POLICY certificates_insert_teacher ON public.certificates FOR INSERT WITH CHECK (
  auth.uid() = teacher_id AND public.is_teacher(auth.uid())
);
CREATE POLICY certificates_delete ON public.certificates FOR DELETE USING (
  auth.uid() = teacher_id OR public.has_role(auth.uid(), 'admin'::public.app_role)
);

CREATE OR REPLACE FUNCTION public.notify_new_certificate()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (NEW.student_id, 'certificate', 'حصلت على شهادة جديدة 🏆', NEW.title, '/profile');
  UPDATE public.profiles SET points = points + 10 WHERE id = NEW.student_id;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_new_certificate ON public.certificates;
CREATE TRIGGER trg_new_certificate AFTER INSERT ON public.certificates
FOR EACH ROW EXECUTE FUNCTION public.notify_new_certificate();

-- 3) Competition comments
CREATE TABLE IF NOT EXISTS public.competition_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL,
  user_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.competition_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY cc_select ON public.competition_comments FOR SELECT USING (true);
CREATE POLICY cc_insert ON public.competition_comments FOR INSERT WITH CHECK (auth.uid() = user_id AND NOT public.is_banned(auth.uid()));
CREATE POLICY cc_delete ON public.competition_comments FOR DELETE USING (auth.uid() = user_id OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- 4) Reactions (generic)
CREATE TABLE IF NOT EXISTS public.reactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  target_type text NOT NULL, -- 'activity' | 'competition' | 'gallery'
  target_id uuid NOT NULL,
  user_id uuid NOT NULL,
  emoji text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (target_type, target_id, user_id, emoji)
);
ALTER TABLE public.reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY reactions_select ON public.reactions FOR SELECT USING (true);
CREATE POLICY reactions_insert ON public.reactions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY reactions_delete ON public.reactions FOR DELETE USING (auth.uid() = user_id);

-- 5) Storage buckets
INSERT INTO storage.buckets (id, name, public) VALUES ('dm-images', 'dm-images', true) ON CONFLICT DO NOTHING;
INSERT INTO storage.buckets (id, name, public) VALUES ('certificates', 'certificates', true) ON CONFLICT DO NOTHING;

CREATE POLICY "dm-images public read" ON storage.objects FOR SELECT USING (bucket_id = 'dm-images');
CREATE POLICY "dm-images authed upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'dm-images' AND auth.uid() IS NOT NULL);
CREATE POLICY "certs public read" ON storage.objects FOR SELECT USING (bucket_id = 'certificates');
CREATE POLICY "certs teacher upload" ON storage.objects FOR INSERT WITH CHECK (bucket_id = 'certificates' AND public.is_teacher(auth.uid()));
