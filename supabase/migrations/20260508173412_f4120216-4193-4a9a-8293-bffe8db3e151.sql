CREATE POLICY qa_update_teacher ON public.quiz_attempts
FOR UPDATE TO public
USING (public.is_teacher(auth.uid()))
WITH CHECK (public.is_teacher(auth.uid()));