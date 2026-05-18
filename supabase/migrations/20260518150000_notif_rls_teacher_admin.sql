-- Notifications RLS: teachers see their students', admins/supervisors see all

DROP POLICY IF EXISTS notif_select_own ON public.notifications;

CREATE POLICY notif_select_role ON public.notifications
  FOR SELECT USING (
    -- Own notifications (everyone)
    auth.uid() = user_id

    OR

    -- Teacher: see notifications of students linked to them
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = notifications.user_id
        AND p.teacher_id = auth.uid()
    )

    OR

    -- Admin / Supervisor: see all notifications
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role::text IN ('admin', 'supervisor')
    )
    OR EXISTS (
      SELECT 1 FROM public.profiles p2
      WHERE p2.id = auth.uid()
        AND p2.role_type IN ('admin', 'supervisor')
    )
  );
