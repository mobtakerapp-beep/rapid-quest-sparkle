-- Restore core badge catalog used by automatic awards and teacher panel
INSERT INTO public.badges (id, name, description, icon, color, audience) VALUES
  ('first_activity', 'أول نشاط', 'نشر أول نشاط معتمد', '📚', 'emerald', 'student'),
  ('five_activities', 'خمس أنشطة', 'نشر 5 أنشطة معتمدة', '🌟', 'amber', 'student'),
  ('ten_activities', 'عشرة أنشطة', 'نشر 10 أنشطة معتمدة', '🏆', 'violet', 'student'),
  ('first_comment', 'أول تعليق', 'شارك بأول تعليق', '💬', 'cyan', 'student'),
  ('creative', 'مبدع المعرض', 'شارك في مسابقات الإبداع', '🎨', 'rose', 'student'),
  ('competition_winner', 'فائز المسابقات', 'إجابة صحيحة في مسابقة', '🥇', 'amber', 'student'),
  ('quiz_starter', 'بدأ الاختبارات', 'حل أول اختبار', '📝', 'emerald', 'student'),
  ('quiz_master', 'محترف الاختبارات', 'حل 5 اختبارات', '🧠', 'violet', 'student'),
  ('certificate_holder', 'صاحب شهادة', 'حصل على شهادة تقدير', '🎖️', 'amber', 'student'),
  ('honor_student', 'طالب لوحة الشرف', 'ضمن لوحة الشرف الأسبوعية', '👑', 'amber', 'student'),
  ('student_of_week', 'طالب الأسبوع', 'تميز هذا الأسبوع', '🌟', 'amber', 'student'),
  ('first_quiz_made', 'أول اختبار', 'أنشأ أول اختبار', '🧪', 'cyan', 'teacher'),
  ('first_competition', 'أول مسابقة', 'أنشأ أول مسابقة', '🏁', 'rose', 'teacher'),
  ('first_assignment', 'أول واجب', 'أنشأ أول واجب', '📋', 'emerald', 'teacher'),
  ('certificate_giver', 'مانح الشهادات', 'منح شهادة تقدير', '🏅', 'violet', 'teacher'),
  ('top_teacher', 'معلم لوحة الشرف', 'ضمن لوحة الشرف الأسبوعية', '👑', 'amber', 'teacher'),
  ('teacher_of_week', 'معلم الأسبوع', 'تميز هذا الأسبوع', '🌟', 'amber', 'teacher')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  icon = EXCLUDED.icon,
  color = EXCLUDED.color,
  audience = EXCLUDED.audience;

-- Safe helper: award a badge only if the badge exists, preventing FK failures from breaking user actions
CREATE OR REPLACE FUNCTION public.safe_award_badge(_user_id uuid, _badge_id text, _awarded_by uuid DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _user_id IS NULL OR _badge_id IS NULL THEN
    RETURN;
  END IF;

  IF EXISTS (SELECT 1 FROM public.badges WHERE id = _badge_id) THEN
    INSERT INTO public.user_badges(user_id, badge_id, awarded_by)
    VALUES (_user_id, _badge_id, _awarded_by)
    ON CONFLICT DO NOTHING;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.award_first_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.safe_award_badge(NEW.user_id, 'first_comment');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.award_creative()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.safe_award_badge(NEW.user_id, 'creative');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.award_activity_badges()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE cnt integer;
BEGIN
  IF NEW.status = 'approved' THEN
    SELECT COUNT(*) INTO cnt FROM public.activities WHERE user_id = NEW.user_id AND status = 'approved';
    IF cnt >= 1 THEN PERFORM public.safe_award_badge(NEW.user_id, 'first_activity'); END IF;
    IF cnt >= 5 THEN PERFORM public.safe_award_badge(NEW.user_id, 'five_activities'); END IF;
    IF cnt >= 10 THEN PERFORM public.safe_award_badge(NEW.user_id, 'ten_activities'); END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.award_on_quiz()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE cnt integer;
BEGIN
  SELECT COUNT(*) INTO cnt FROM public.quiz_attempts WHERE user_id = NEW.user_id;
  IF cnt >= 1 THEN PERFORM public.safe_award_badge(NEW.user_id, 'quiz_starter'); END IF;
  IF cnt >= 5 THEN PERFORM public.safe_award_badge(NEW.user_id, 'quiz_master'); END IF;
  UPDATE public.profiles SET points = COALESCE(points, 0) + COALESCE(NEW.score, 0) WHERE id = NEW.user_id;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.award_on_competition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.is_correct THEN
    PERFORM public.safe_award_badge(NEW.user_id, 'competition_winner');
    UPDATE public.profiles SET points = COALESCE(points, 0) + 5 WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.award_on_certificate()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.safe_award_badge(NEW.student_id, 'certificate_holder');
  PERFORM public.safe_award_badge(NEW.teacher_id, 'certificate_giver');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.award_teacher_first_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.safe_award_badge(NEW.teacher_id, 'first_assignment');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.award_teacher_first_quiz()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.safe_award_badge(NEW.created_by, 'first_quiz_made');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.award_teacher_first_competition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.safe_award_badge(NEW.created_by, 'first_competition');
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_new_badge()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE bname text;
BEGIN
  SELECT name INTO bname FROM public.badges WHERE id = NEW.badge_id;
  INSERT INTO public.notifications (user_id, type, title, body, link)
  VALUES (NEW.user_id, 'badge', 'حصلت على شارة جديدة 🏅', COALESCE(bname, NEW.badge_id), '/badges');
  RETURN NEW;
END;
$$;

-- Recreate missing triggers
DROP TRIGGER IF EXISTS award_first_comment_act_t ON public.activity_comments;
CREATE TRIGGER award_first_comment_act_t AFTER INSERT ON public.activity_comments
FOR EACH ROW EXECUTE FUNCTION public.award_first_comment();

DROP TRIGGER IF EXISTS award_first_comment_gal_t ON public.gallery_comments;
CREATE TRIGGER award_first_comment_gal_t AFTER INSERT ON public.gallery_comments
FOR EACH ROW EXECUTE FUNCTION public.award_first_comment();

DROP TRIGGER IF EXISTS award_creative_t ON public.gallery_contest_entries;
CREATE TRIGGER award_creative_t AFTER INSERT ON public.gallery_contest_entries
FOR EACH ROW EXECUTE FUNCTION public.award_creative();

DROP TRIGGER IF EXISTS award_activity_badges_t ON public.activities;
CREATE TRIGGER award_activity_badges_t AFTER INSERT OR UPDATE ON public.activities
FOR EACH ROW EXECUTE FUNCTION public.award_activity_badges();

DROP TRIGGER IF EXISTS award_on_quiz_t ON public.quiz_attempts;
CREATE TRIGGER award_on_quiz_t AFTER INSERT ON public.quiz_attempts
FOR EACH ROW EXECUTE FUNCTION public.award_on_quiz();

DROP TRIGGER IF EXISTS award_on_competition_t ON public.competition_submissions;
CREATE TRIGGER award_on_competition_t AFTER INSERT OR UPDATE ON public.competition_submissions
FOR EACH ROW EXECUTE FUNCTION public.award_on_competition();

DROP TRIGGER IF EXISTS award_on_certificate_t ON public.certificates;
CREATE TRIGGER award_on_certificate_t AFTER INSERT ON public.certificates
FOR EACH ROW EXECUTE FUNCTION public.award_on_certificate();

DROP TRIGGER IF EXISTS award_teacher_first_assignment_t ON public.assignments;
CREATE TRIGGER award_teacher_first_assignment_t AFTER INSERT ON public.assignments
FOR EACH ROW EXECUTE FUNCTION public.award_teacher_first_assignment();

DROP TRIGGER IF EXISTS award_teacher_first_quiz_t ON public.quizzes;
CREATE TRIGGER award_teacher_first_quiz_t AFTER INSERT ON public.quizzes
FOR EACH ROW EXECUTE FUNCTION public.award_teacher_first_quiz();

DROP TRIGGER IF EXISTS award_teacher_first_competition_t ON public.competitions;
CREATE TRIGGER award_teacher_first_competition_t AFTER INSERT ON public.competitions
FOR EACH ROW EXECUTE FUNCTION public.award_teacher_first_competition();

DROP TRIGGER IF EXISTS trg_new_badge ON public.user_badges;
CREATE TRIGGER trg_new_badge AFTER INSERT ON public.user_badges
FOR EACH ROW EXECUTE FUNCTION public.notify_new_badge();

-- Ban guard: admins can ban supervisors/teachers; supervisors can ban only students/parents; admins themselves cannot be banned
CREATE OR REPLACE FUNCTION public.guard_profile_ban()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  caller uuid := auth.uid();
  caller_is_admin boolean := public.has_role(caller, 'admin'::app_role);
  caller_is_supervisor boolean := public.has_role(caller, 'supervisor'::app_role);
  target_is_admin boolean := public.has_role(NEW.id, 'admin'::app_role);
  target_is_staff boolean := public.has_role(NEW.id, 'teacher'::app_role)
    OR public.has_role(NEW.id, 'supervisor'::app_role)
    OR COALESCE(NEW.role_type, '') IN ('teacher', 'supervisor');
BEGIN
  IF NEW.is_banned IS DISTINCT FROM OLD.is_banned THEN
    IF target_is_admin THEN
      RAISE EXCEPTION 'لا يمكن حظر المشرف العام';
    END IF;
    IF caller_is_admin THEN
      RETURN NEW;
    END IF;
    IF caller_is_supervisor AND NOT target_is_staff THEN
      RETURN NEW;
    END IF;
    IF target_is_staff THEN
      RAISE EXCEPTION 'فقط المشرف العام يمكنه حظر المعلمين/المشرفين';
    END IF;
    RAISE EXCEPTION 'صلاحية الحظر للمشرف العام والمشرفين فقط';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS guard_profile_ban_t ON public.profiles;
CREATE TRIGGER guard_profile_ban_t BEFORE UPDATE OF is_banned ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_ban();