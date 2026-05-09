
-- 1) Ban protection trigger
CREATE OR REPLACE FUNCTION public.guard_profile_ban()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  caller uuid := auth.uid();
  caller_is_admin boolean := public.has_role(caller, 'admin'::app_role);
  target_is_admin boolean := public.has_role(NEW.id, 'admin'::app_role);
  target_is_teacher boolean := public.has_role(NEW.id, 'teacher'::app_role) OR public.has_role(NEW.id, 'supervisor'::app_role);
BEGIN
  IF NEW.is_banned IS DISTINCT FROM OLD.is_banned THEN
    -- Admin can do anything (also: admin cannot be banned by anyone but themselves; we still block)
    IF target_is_admin AND NOT caller_is_admin THEN
      RAISE EXCEPTION 'لا يمكن حظر مشرف عام';
    END IF;
    IF target_is_admin AND NEW.is_banned = true THEN
      RAISE EXCEPTION 'لا يمكن حظر مشرف عام';
    END IF;
    IF target_is_teacher AND NOT caller_is_admin THEN
      RAISE EXCEPTION 'فقط المشرف العام يمكنه حظر المعلمين/المشرفين';
    END IF;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_guard_profile_ban ON public.profiles;
CREATE TRIGGER trg_guard_profile_ban
BEFORE UPDATE OF is_banned ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_ban();

-- Allow teachers/supervisors to ban students (update only is_banned)
DROP POLICY IF EXISTS profiles_teacher_ban ON public.profiles;
CREATE POLICY profiles_teacher_ban ON public.profiles
FOR UPDATE TO public
USING (public.is_teacher(auth.uid()))
WITH CHECK (public.is_teacher(auth.uid()));

-- 2) Allow text-only gallery contest entries
ALTER TABLE public.gallery_contest_entries ALTER COLUMN media_url DROP NOT NULL;

CREATE OR REPLACE FUNCTION public.gce_require_content()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF (NEW.media_url IS NULL OR length(trim(NEW.media_url)) = 0)
     AND (NEW.caption IS NULL OR length(trim(NEW.caption)) = 0) THEN
    RAISE EXCEPTION 'يجب إضافة نص أو ملف للمشاركة';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_gce_require_content ON public.gallery_contest_entries;
CREATE TRIGGER trg_gce_require_content
BEFORE INSERT OR UPDATE ON public.gallery_contest_entries
FOR EACH ROW EXECUTE FUNCTION public.gce_require_content();

-- 3) Notify teacher on new quiz attempt
CREATE OR REPLACE FUNCTION public.notify_teacher_on_quiz_attempt()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q_title text;
  q_owner uuid;
  s_name text;
BEGIN
  SELECT title, created_by INTO q_title, q_owner FROM public.quizzes WHERE id = NEW.quiz_id;
  IF q_owner IS NULL OR q_owner = NEW.user_id THEN RETURN NEW; END IF;
  SELECT display_name INTO s_name FROM public.profiles WHERE id = NEW.user_id;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (q_owner, 'quiz_attempt',
          'محاولة جديدة لاختبار: ' || COALESCE(q_title,''),
          COALESCE(s_name,'طالب') || ' حصل على ' || NEW.score || '/' || NEW.total,
          '/teacher');
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_teacher_quiz ON public.quiz_attempts;
CREATE TRIGGER trg_notify_teacher_quiz
AFTER INSERT ON public.quiz_attempts
FOR EACH ROW EXECUTE FUNCTION public.notify_teacher_on_quiz_attempt();

-- 4) Notify student when their attempt is graded (score changes)
CREATE OR REPLACE FUNCTION public.notify_student_on_grade()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q_title text;
BEGIN
  IF NEW.score IS DISTINCT FROM OLD.score OR NEW.total IS DISTINCT FROM OLD.total THEN
    SELECT title INTO q_title FROM public.quizzes WHERE id = NEW.quiz_id;
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (NEW.user_id, 'quiz_graded',
            'تم تصحيح اختبارك ✅',
            COALESCE(q_title,'الاختبار') || ' — درجتك: ' || NEW.score || '/' || NEW.total,
            '/quizzes');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_notify_student_grade ON public.quiz_attempts;
CREATE TRIGGER trg_notify_student_grade
AFTER UPDATE ON public.quiz_attempts
FOR EACH ROW EXECUTE FUNCTION public.notify_student_on_grade();

-- 5) Realtime for notifications
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
