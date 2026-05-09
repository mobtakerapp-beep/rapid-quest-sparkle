
-- Allow supervisors to delete in addition to admins
DROP POLICY IF EXISTS messages_admin_delete ON public.messages;
CREATE POLICY messages_mod_delete ON public.messages FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

DROP POLICY IF EXISTS galc_delete_own ON public.gallery_comments;
CREATE POLICY galc_delete_own ON public.gallery_comments FOR DELETE
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

DROP POLICY IF EXISTS ac_delete_own ON public.activity_comments;
CREATE POLICY ac_delete_own ON public.activity_comments FOR DELETE
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

DROP POLICY IF EXISTS cc_delete_own ON public.competition_comments;
CREATE POLICY cc_delete_own ON public.competition_comments FOR DELETE
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

DROP POLICY IF EXISTS gce_delete_own ON public.gallery_contest_entries;
CREATE POLICY gce_delete_own ON public.gallery_contest_entries FOR DELETE
USING (auth.uid() = user_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

DROP POLICY IF EXISTS activities_admin_delete ON public.activities;
CREATE POLICY activities_mod_delete ON public.activities FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

DROP POLICY IF EXISTS comp_delete_owner ON public.competitions;
CREATE POLICY comp_delete_owner ON public.competitions FOR DELETE
USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

DROP POLICY IF EXISTS assignments_delete_owner ON public.assignments;
CREATE POLICY assignments_delete_owner ON public.assignments FOR DELETE
USING (auth.uid() = teacher_id OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

DROP POLICY IF EXISTS quizzes_delete_owner ON public.quizzes;
CREATE POLICY quizzes_delete_owner ON public.quizzes FOR DELETE
USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

DROP POLICY IF EXISTS gcst_delete_owner ON public.gallery_contests;
CREATE POLICY gcst_delete_owner ON public.gallery_contests FOR DELETE
USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

DROP POLICY IF EXISTS events_delete_owner ON public.events;
CREATE POLICY events_delete_owner ON public.events FOR DELETE
USING (auth.uid() = created_by OR has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

-- Reports: add optional target reference + allow supervisors to view/manage
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS target_kind text;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS target_id uuid;
ALTER TABLE public.reports ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'open';

DROP POLICY IF EXISTS reports_mod_all ON public.reports;
CREATE POLICY reports_mod_all ON public.reports FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));
