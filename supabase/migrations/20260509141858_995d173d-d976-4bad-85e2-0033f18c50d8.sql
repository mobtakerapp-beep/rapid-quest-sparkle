
-- 1) Drop public phone column (data is in profiles_private)
ALTER TABLE public.profiles DROP COLUMN IF EXISTS phone;

-- 2) Tighten competition_submissions select policy
DROP POLICY IF EXISTS cs_select ON public.competition_submissions;
CREATE POLICY cs_select ON public.competition_submissions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.is_teacher(auth.uid()) OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- 3) Tighten notifications insert
DROP POLICY IF EXISTS notif_insert ON public.notifications;
CREATE POLICY notif_insert ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- 4) Allow teachers to update quiz attempts (for essay grading)
DROP POLICY IF EXISTS qa_update_teacher ON public.quiz_attempts;
CREATE POLICY qa_update_teacher ON public.quiz_attempts
  FOR UPDATE TO authenticated
  USING (public.is_teacher(auth.uid()))
  WITH CHECK (public.is_teacher(auth.uid()));

-- 5) Re-attach triggers (drop+recreate to be safe)
DROP TRIGGER IF EXISTS trg_notify_new_dm ON public.direct_messages;
CREATE TRIGGER trg_notify_new_dm
AFTER INSERT ON public.direct_messages
FOR EACH ROW EXECUTE FUNCTION public.notify_new_dm();

DROP TRIGGER IF EXISTS trg_notify_new_badge ON public.user_badges;
CREATE TRIGGER trg_notify_new_badge
AFTER INSERT ON public.user_badges
FOR EACH ROW EXECUTE FUNCTION public.notify_new_badge();

DROP TRIGGER IF EXISTS trg_notify_new_certificate ON public.certificates;
CREATE TRIGGER trg_notify_new_certificate
AFTER INSERT ON public.certificates
FOR EACH ROW EXECUTE FUNCTION public.notify_new_certificate();

DROP TRIGGER IF EXISTS trg_award_on_certificate ON public.certificates;
CREATE TRIGGER trg_award_on_certificate
AFTER INSERT ON public.certificates
FOR EACH ROW EXECUTE FUNCTION public.award_on_certificate();

DROP TRIGGER IF EXISTS trg_award_on_quiz ON public.quiz_attempts;
CREATE TRIGGER trg_award_on_quiz
AFTER INSERT ON public.quiz_attempts
FOR EACH ROW EXECUTE FUNCTION public.award_on_quiz();

DROP TRIGGER IF EXISTS trg_award_teacher_first_quiz ON public.quizzes;
CREATE TRIGGER trg_award_teacher_first_quiz
AFTER INSERT ON public.quizzes
FOR EACH ROW EXECUTE FUNCTION public.award_teacher_first_quiz();

DROP TRIGGER IF EXISTS trg_handle_new_user ON auth.users;
CREATE TRIGGER trg_handle_new_user
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 6) Notify quiz creator when student submits an attempt
CREATE OR REPLACE FUNCTION public.notify_quiz_creator_on_attempt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _creator uuid; _title text; _student text; _has_essay boolean;
BEGIN
  SELECT created_by, title INTO _creator, _title FROM public.quizzes WHERE id = NEW.quiz_id;
  IF _creator IS NULL OR _creator = NEW.user_id THEN RETURN NEW; END IF;
  SELECT display_name INTO _student FROM public.profiles WHERE id = NEW.user_id;
  _has_essay := (NEW.details IS NOT NULL) AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(NEW.details) e WHERE e->>'type' = 'essay'
  );
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (
    _creator, 'quiz_submitted',
    CASE WHEN _has_essay THEN 'محاولة اختبار بحاجة لتصحيح ✏️' ELSE 'طالب حلّ اختبارك ✅' END,
    COALESCE(_student,'طالب') || ' — ' || COALESCE(_title,'اختبار') || ' (' || NEW.score || '/' || NEW.total || ')',
    '/teacher'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_quiz_creator ON public.quiz_attempts;
CREATE TRIGGER trg_notify_quiz_creator
AFTER INSERT ON public.quiz_attempts
FOR EACH ROW EXECUTE FUNCTION public.notify_quiz_creator_on_attempt();

-- 7) Notify student when their attempt is updated (graded)
CREATE OR REPLACE FUNCTION public.notify_student_on_grade()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE _title text;
BEGIN
  IF NEW.score IS DISTINCT FROM OLD.score OR NEW.details IS DISTINCT FROM OLD.details THEN
    SELECT title INTO _title FROM public.quizzes WHERE id = NEW.quiz_id;
    INSERT INTO public.notifications (user_id, type, title, body, link)
    VALUES (NEW.user_id, 'quiz_graded', 'تم تصحيح اختبارك 🎉',
      COALESCE(_title,'اختبار') || ' — درجتك: ' || NEW.score || '/' || NEW.total,
      '/badges');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_student_on_grade ON public.quiz_attempts;
CREATE TRIGGER trg_notify_student_on_grade
AFTER UPDATE ON public.quiz_attempts
FOR EACH ROW EXECUTE FUNCTION public.notify_student_on_grade();

-- 8) Ensure all teacher profiles have a class_code
UPDATE public.profiles
SET class_code = public.generate_class_code()
WHERE role_type = 'teacher' AND (class_code IS NULL OR class_code = '');
