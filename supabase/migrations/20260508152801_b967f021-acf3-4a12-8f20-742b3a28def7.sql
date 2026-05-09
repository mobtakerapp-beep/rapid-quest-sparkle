-- 1) Make is_teacher also accept profile role_type
CREATE OR REPLACE FUNCTION public.is_teacher(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT public.has_role(_user_id, 'admin'::public.app_role)
      OR public.has_role(_user_id, 'teacher'::public.app_role)
      OR public.has_role(_user_id, 'supervisor'::public.app_role)
      OR EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = _user_id AND role_type IN ('teacher','supervisor')
      )
$$;

-- 2) Add quiz attempt details
ALTER TABLE public.quiz_attempts
  ADD COLUMN IF NOT EXISTS details jsonb;

-- 3) Insert/refresh badges catalog
INSERT INTO public.badges (id, name, description, icon, color, audience) VALUES
  -- student
  ('first_activity',     'أول نشاط',          'رفعت أول نشاط',          '✨','amber','student'),
  ('five_activities',    '5 أنشطة',           'وصلت إلى 5 أنشطة',       '🔥','amber','student'),
  ('ten_activities',     '10 أنشطة',          '10 أنشطة وأكثر',         '⚡','amber','student'),
  ('first_comment',      'أول تعليق',          'شاركت بأول تعليق',       '💬','cyan','student'),
  ('quiz_starter',       'بداية موفقة',        'حللت أول اختبار',        '🎯','rose','student'),
  ('quiz_master',        'بطل الاختبارات',     '5 اختبارات بنجاح',       '🏆','rose','student'),
  ('competition_winner', 'بطل المسابقات',      'أجبت إجابة صحيحة بالمسابقة','🥇','amber','student'),
  ('creative',           'مبدع',               'شاركت في معرض الإبداع',   '🎨','violet','student'),
  ('honor_student',      'نجم الأسبوع',        'الأعلى نقاطاً هذا الأسبوع','🎖️','amber','student'),
  ('certificate_holder', 'حامل الشهادة',       'حصلت على شهادة تقدير',    '🏅','emerald','student'),
  ('helpful_friend',     'الصديق المساعد',     'تفاعل إيجابي مع الزملاء',  '🤝','cyan','student'),
  ('top10',              'ضمن العشرة الأوائل', 'دخلت قائمة العشرة الأوائل','🌟','violet','student'),
  -- teacher
  ('first_quiz_made',    'أول اختبار',         'أنشأت أول اختبار',        '📝','emerald','teacher'),
  ('first_competition',  'أول مسابقة',         'أنشأت أول مسابقة',        '🎯','amber','teacher'),
  ('first_assignment',   'أول واجب',           'أنشأت أول واجب',          '📚','cyan','teacher'),
  ('certificate_giver',  'مانح الشهادات',      'منحت شهادة لطالب',        '🏅','violet','teacher'),
  ('top_teacher',        'المعلم المتميز',     'الأعلى نقاطاً هذا الأسبوع', '👑','amber','teacher'),
  ('class_builder',      'باني الفصل',         'أضفت 5 طلاب لفصلك',       '🏗️','emerald','teacher'),
  ('active_teacher',     'المعلم النشط',       'مشاركات متعددة في المنصة', '⚡','rose','teacher')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name, description = EXCLUDED.description,
  icon = EXCLUDED.icon, color = EXCLUDED.color, audience = EXCLUDED.audience;

-- 4) Award weekly top function (single winner per audience)
CREATE OR REPLACE FUNCTION public.award_weekly_top()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  top_student uuid;
  top_teacher uuid;
BEGIN
  -- pick current top
  SELECT id INTO top_student FROM public.profiles
    WHERE role_type = 'student' OR role_type IS NULL
    ORDER BY points DESC NULLS LAST LIMIT 1;
  SELECT id INTO top_teacher FROM public.profiles
    WHERE role_type IN ('teacher','supervisor')
    ORDER BY points DESC NULLS LAST LIMIT 1;

  -- Remove old winners (so badge is exclusive to current top)
  IF top_student IS NOT NULL THEN
    DELETE FROM public.user_badges WHERE badge_id = 'honor_student' AND user_id <> top_student;
    INSERT INTO public.user_badges(user_id, badge_id) VALUES (top_student, 'honor_student')
      ON CONFLICT DO NOTHING;
    INSERT INTO public.weekly_top(user_id, week_start, points, role_type)
    SELECT top_student, date_trunc('week', now())::date, points, 'student'
      FROM public.profiles WHERE id = top_student
    ON CONFLICT DO NOTHING;
  END IF;

  IF top_teacher IS NOT NULL THEN
    DELETE FROM public.user_badges WHERE badge_id = 'top_teacher' AND user_id <> top_teacher;
    INSERT INTO public.user_badges(user_id, badge_id) VALUES (top_teacher, 'top_teacher')
      ON CONFLICT DO NOTHING;
    INSERT INTO public.weekly_top(user_id, week_start, points, role_type)
    SELECT top_teacher, date_trunc('week', now())::date, points, 'teacher'
      FROM public.profiles WHERE id = top_teacher
    ON CONFLICT DO NOTHING;
  END IF;

  RETURN jsonb_build_object('top_student', top_student, 'top_teacher', top_teacher);
END $$;

-- 5) Auto-award on certificate received
CREATE OR REPLACE FUNCTION public.award_on_certificate()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_badges(user_id, badge_id) VALUES (NEW.student_id, 'certificate_holder')
    ON CONFLICT DO NOTHING;
  INSERT INTO public.user_badges(user_id, badge_id) VALUES (NEW.teacher_id, 'certificate_giver')
    ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS award_on_certificate_t ON public.certificates;
CREATE TRIGGER award_on_certificate_t AFTER INSERT ON public.certificates
  FOR EACH ROW EXECUTE FUNCTION public.award_on_certificate();

-- 6) Auto-award on quiz attempt
CREATE OR REPLACE FUNCTION public.award_on_quiz()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE cnt INT;
BEGIN
  SELECT COUNT(*) INTO cnt FROM public.quiz_attempts WHERE user_id = NEW.user_id;
  IF cnt >= 1 THEN
    INSERT INTO public.user_badges(user_id, badge_id) VALUES (NEW.user_id, 'quiz_starter') ON CONFLICT DO NOTHING;
  END IF;
  IF cnt >= 5 THEN
    INSERT INTO public.user_badges(user_id, badge_id) VALUES (NEW.user_id, 'quiz_master') ON CONFLICT DO NOTHING;
  END IF;
  -- give points
  UPDATE public.profiles SET points = COALESCE(points,0) + COALESCE(NEW.score,0) WHERE id = NEW.user_id;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS award_on_quiz_t ON public.quiz_attempts;
CREATE TRIGGER award_on_quiz_t AFTER INSERT ON public.quiz_attempts
  FOR EACH ROW EXECUTE FUNCTION public.award_on_quiz();

-- 7) Auto-award on competition correct submission
CREATE OR REPLACE FUNCTION public.award_on_competition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.is_correct THEN
    INSERT INTO public.user_badges(user_id, badge_id) VALUES (NEW.user_id, 'competition_winner') ON CONFLICT DO NOTHING;
    UPDATE public.profiles SET points = COALESCE(points,0) + 5 WHERE id = NEW.user_id;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS award_on_competition_t ON public.competition_submissions;
CREATE TRIGGER award_on_competition_t AFTER INSERT OR UPDATE ON public.competition_submissions
  FOR EACH ROW EXECUTE FUNCTION public.award_on_competition();

-- 8) Award teacher badges on creating quiz/competition/assignment
CREATE OR REPLACE FUNCTION public.award_teacher_first_quiz()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN INSERT INTO public.user_badges(user_id, badge_id) VALUES (NEW.created_by, 'first_quiz_made') ON CONFLICT DO NOTHING; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS award_teacher_first_quiz_t ON public.quizzes;
CREATE TRIGGER award_teacher_first_quiz_t AFTER INSERT ON public.quizzes
  FOR EACH ROW EXECUTE FUNCTION public.award_teacher_first_quiz();

CREATE OR REPLACE FUNCTION public.award_teacher_first_competition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN INSERT INTO public.user_badges(user_id, badge_id) VALUES (NEW.created_by, 'first_competition') ON CONFLICT DO NOTHING; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS award_teacher_first_comp_t ON public.competitions;
CREATE TRIGGER award_teacher_first_comp_t AFTER INSERT ON public.competitions
  FOR EACH ROW EXECUTE FUNCTION public.award_teacher_first_competition();

CREATE OR REPLACE FUNCTION public.award_teacher_first_assignment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN INSERT INTO public.user_badges(user_id, badge_id) VALUES (NEW.teacher_id, 'first_assignment') ON CONFLICT DO NOTHING; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS award_teacher_first_assign_t ON public.assignments;
CREATE TRIGGER award_teacher_first_assign_t AFTER INSERT ON public.assignments
  FOR EACH ROW EXECUTE FUNCTION public.award_teacher_first_assignment();

-- 9) Award first_comment badge
CREATE OR REPLACE FUNCTION public.award_first_comment()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.user_badges(user_id, badge_id) VALUES (NEW.user_id, 'first_comment') ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS award_first_comment_act_t ON public.activity_comments;
CREATE TRIGGER award_first_comment_act_t AFTER INSERT ON public.activity_comments
  FOR EACH ROW EXECUTE FUNCTION public.award_first_comment();
DROP TRIGGER IF EXISTS award_first_comment_gal_t ON public.gallery_comments;
CREATE TRIGGER award_first_comment_gal_t AFTER INSERT ON public.gallery_comments
  FOR EACH ROW EXECUTE FUNCTION public.award_first_comment();

-- 10) Award creative badge on contest entry
CREATE OR REPLACE FUNCTION public.award_creative()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN INSERT INTO public.user_badges(user_id, badge_id) VALUES (NEW.user_id, 'creative') ON CONFLICT DO NOTHING; RETURN NEW; END $$;
DROP TRIGGER IF EXISTS award_creative_t ON public.gallery_contest_entries;
CREATE TRIGGER award_creative_t AFTER INSERT ON public.gallery_contest_entries
  FOR EACH ROW EXECUTE FUNCTION public.award_creative();