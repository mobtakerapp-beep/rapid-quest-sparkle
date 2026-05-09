
-- 1) Allow joining via class code for any staff role (teacher/admin/supervisor)
CREATE OR REPLACE FUNCTION public.join_teacher_by_code(_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _tid uuid;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  SELECT id INTO _tid FROM public.profiles
   WHERE class_code = upper(trim(_code))
     AND role_type IN ('teacher','admin','supervisor')
   LIMIT 1;
  IF _tid IS NULL THEN RETURN false; END IF;
  UPDATE public.profiles SET teacher_id = _tid WHERE id = _uid;
  RETURN true;
END; $$;

-- 2) Drop duplicate triggers
DROP TRIGGER IF EXISTS guard_profile_ban_t ON public.profiles;
DROP TRIGGER IF EXISTS trg_guard_profile_ban ON public.profiles;
DROP TRIGGER IF EXISTS trg_guard_profile_protected ON public.profiles;
DROP TRIGGER IF EXISTS trg_profiles_protect_role ON public.profiles;
DROP TRIGGER IF EXISTS trg_protect_profile_role_type ON public.profiles;
DROP TRIGGER IF EXISTS trg_profiles_protected_cols ON public.profiles;
DROP TRIGGER IF EXISTS trg_profiles_class_code ON public.profiles;
DROP TRIGGER IF EXISTS trg_messages_profanity ON public.messages;
DROP TRIGGER IF EXISTS trg_new_badge ON public.user_badges;
DROP TRIGGER IF EXISTS trg_notify_new_badge ON public.user_badges;
DROP TRIGGER IF EXISTS trg_notify_teacher_quiz ON public.quiz_attempts;
DROP TRIGGER IF EXISTS trg_quiz_notify_teacher ON public.quiz_attempts;
DROP TRIGGER IF EXISTS trg_notify_quiz_creator ON public.quiz_attempts;
DROP TRIGGER IF EXISTS trg_notify_student_on_grade ON public.quiz_attempts;
DROP TRIGGER IF EXISTS trg_notify_student_grade ON public.quiz_attempts;
DROP TRIGGER IF EXISTS award_on_quiz_t ON public.quiz_attempts;
DROP TRIGGER IF EXISTS trg_quiz_award_points ON public.quiz_attempts;
DROP TRIGGER IF EXISTS trg_award_quiz_points ON public.quiz_attempts;
DROP TRIGGER IF EXISTS trg_award_on_quiz ON public.quiz_attempts;
DROP TRIGGER IF EXISTS award_teacher_first_quiz_t ON public.quizzes;
DROP TRIGGER IF EXISTS trg_award_teacher_first_quiz ON public.quizzes;
DROP TRIGGER IF EXISTS trg_award_comp ON public.competition_submissions;

-- 3) Notify owner when student comments on activity
CREATE OR REPLACE FUNCTION public.notify_activity_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner uuid; _name text;
BEGIN
  SELECT user_id INTO _owner FROM public.activities WHERE id = NEW.activity_id;
  IF _owner IS NULL OR _owner = NEW.user_id THEN RETURN NEW; END IF;
  SELECT display_name INTO _name FROM public.profiles WHERE id = NEW.user_id;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (_owner, 'activity_comment', 'تعليق جديد على نشاطك',
          COALESCE(_name,'طالب') || ' علّق على نشاطك',
          '/activities');
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_activity_comment_notify ON public.activity_comments;
CREATE TRIGGER trg_activity_comment_notify
AFTER INSERT ON public.activity_comments
FOR EACH ROW EXECUTE FUNCTION public.notify_activity_comment();

-- 4) Notify teacher on assignment submission
CREATE OR REPLACE FUNCTION public.notify_assignment_submission()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _teacher uuid; _title text; _name text;
BEGIN
  SELECT teacher_id, title INTO _teacher, _title FROM public.assignments WHERE id = NEW.assignment_id;
  IF _teacher IS NULL OR _teacher = NEW.student_id THEN RETURN NEW; END IF;
  SELECT display_name INTO _name FROM public.profiles WHERE id = NEW.student_id;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (_teacher, 'assignment_submission', 'تسليم واجب جديد',
          COALESCE(_name,'طالب') || ' سلّم: ' || COALESCE(_title,''),
          '/assignments');
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_assignment_sub_notify ON public.assignment_submissions;
CREATE TRIGGER trg_assignment_sub_notify
AFTER INSERT ON public.assignment_submissions
FOR EACH ROW EXECUTE FUNCTION public.notify_assignment_submission();

-- 5) Notify gallery item owner on comment (if separate table exists)
CREATE OR REPLACE FUNCTION public.notify_gallery_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _owner uuid; _name text;
BEGIN
  -- gallery items are user activities? gallery_comments has item_id but no source table reference
  -- best-effort: if item_id is a gallery_contest_entries id, notify entry owner
  SELECT user_id INTO _owner FROM public.gallery_contest_entries WHERE id = NEW.item_id;
  IF _owner IS NULL OR _owner = NEW.user_id THEN RETURN NEW; END IF;
  SELECT display_name INTO _name FROM public.profiles WHERE id = NEW.user_id;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (_owner, 'gallery_comment', 'تعليق جديد على مشاركتك',
          COALESCE(_name,'طالب') || ' علّق على مشاركتك في المعرض',
          '/gallery');
  RETURN NEW;
END; $$;
DROP TRIGGER IF EXISTS trg_gallery_comment_notify ON public.gallery_comments;
CREATE TRIGGER trg_gallery_comment_notify
AFTER INSERT ON public.gallery_comments
FOR EACH ROW EXECUTE FUNCTION public.notify_gallery_comment();
