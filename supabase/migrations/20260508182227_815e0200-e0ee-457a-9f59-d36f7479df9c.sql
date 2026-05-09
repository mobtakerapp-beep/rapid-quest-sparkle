
-- 1) Tighten ban policy: only admin/supervisor can update bans (not regular teachers)
DROP POLICY IF EXISTS profiles_teacher_ban ON public.profiles;
CREATE POLICY profiles_supervisor_ban ON public.profiles
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'supervisor'::app_role));

-- 2) Update ban guard: supervisors can only ban students/parents; admin can ban all (except admin)
CREATE OR REPLACE FUNCTION public.guard_profile_ban()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  caller uuid := auth.uid();
  caller_is_admin boolean := public.has_role(caller, 'admin'::app_role);
  caller_is_supervisor boolean := public.has_role(caller, 'supervisor'::app_role);
  target_is_admin boolean := public.has_role(NEW.id, 'admin'::app_role);
  target_is_teacher boolean := public.has_role(NEW.id, 'teacher'::app_role) OR public.has_role(NEW.id, 'supervisor'::app_role);
BEGIN
  IF NEW.is_banned IS DISTINCT FROM OLD.is_banned THEN
    -- Admin is fully protected
    IF target_is_admin THEN
      RAISE EXCEPTION 'لا يمكن حظر مشرف عام';
    END IF;
    -- Only admin can ban teacher or supervisor
    IF target_is_teacher AND NOT caller_is_admin THEN
      RAISE EXCEPTION 'فقط المشرف العام يمكنه حظر المعلمين/المشرفين';
    END IF;
    -- Caller must be admin or supervisor
    IF NOT caller_is_admin AND NOT caller_is_supervisor THEN
      RAISE EXCEPTION 'صلاحية الحظر للمشرف العام والمشرفين فقط';
    END IF;
  END IF;
  RETURN NEW;
END $function$;

DROP TRIGGER IF EXISTS trg_guard_profile_ban ON public.profiles;
CREATE TRIGGER trg_guard_profile_ban
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_ban();

-- 3) Quiz: one attempt per student per quiz
ALTER TABLE public.quiz_attempts
  ADD CONSTRAINT quiz_attempts_unique_user UNIQUE (quiz_id, user_id);

-- 4) Assignment: one submission per student per assignment
ALTER TABLE public.assignment_submissions
  ADD CONSTRAINT assignment_subs_unique_student UNIQUE (assignment_id, student_id);

-- 5) Realtime for direct messages (faster delivery)
ALTER TABLE public.direct_messages REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
