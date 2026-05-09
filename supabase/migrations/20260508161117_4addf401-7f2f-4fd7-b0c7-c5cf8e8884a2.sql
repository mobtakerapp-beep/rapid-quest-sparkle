
ALTER TABLE public.user_badges DROP CONSTRAINT IF EXISTS user_badges_user_id_badge_id_key;

DROP POLICY IF EXISTS badges_insert_teacher ON public.badges;
CREATE POLICY badges_insert_teacher ON public.badges
  FOR INSERT TO public
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND role IN ('admin'::public.app_role, 'teacher'::public.app_role, 'supervisor'::public.app_role)
    )
  );
