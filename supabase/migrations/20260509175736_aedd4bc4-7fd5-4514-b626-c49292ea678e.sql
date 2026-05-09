
-- Drop duplicate triggers (keeping one per table+function)
DROP TRIGGER IF EXISTS trg_auto_approve_activity ON public.activities;
DROP TRIGGER IF EXISTS award_activity_badges_t ON public.activities;
DROP TRIGGER IF EXISTS trg_award_activity_badges ON public.activities;
DROP TRIGGER IF EXISTS trg_notify_approved ON public.activities;
DROP TRIGGER IF EXISTS trg_notify_new_activity ON public.activities;

DROP TRIGGER IF EXISTS award_first_comment_act_t ON public.activity_comments;

DROP TRIGGER IF EXISTS award_teacher_first_assignment_t ON public.assignments;
DROP TRIGGER IF EXISTS trg_notify_new_assignment ON public.assignments;

DROP TRIGGER IF EXISTS award_on_certificate_t ON public.certificates;
DROP TRIGGER IF EXISTS trg_cert_award ON public.certificates;
DROP TRIGGER IF EXISTS trg_new_certificate ON public.certificates;
DROP TRIGGER IF EXISTS trg_notify_new_certificate ON public.certificates;

DROP TRIGGER IF EXISTS trg_notify_new_competition_comment ON public.competition_comments;

DROP TRIGGER IF EXISTS trg_comp_autograde ON public.competition_submissions;
DROP TRIGGER IF EXISTS trg_comp_award_badge ON public.competition_submissions;
DROP TRIGGER IF EXISTS trg_comp_award_points ON public.competition_submissions;
DROP TRIGGER IF EXISTS award_on_competition_t ON public.competition_submissions;
DROP TRIGGER IF EXISTS trg_notify_competition_marked_correct ON public.competition_submissions;
DROP TRIGGER IF EXISTS trg_notify_competition_submission ON public.competition_submissions;

DROP TRIGGER IF EXISTS award_teacher_first_competition_t ON public.competitions;
DROP TRIGGER IF EXISTS trg_notify_new_competition ON public.competitions;

DROP TRIGGER IF EXISTS trg_notify_dm ON public.direct_messages;
DROP TRIGGER IF EXISTS trg_notify_new_dm ON public.direct_messages;

DROP TRIGGER IF EXISTS award_first_comment_gal_t ON public.gallery_comments;

DROP TRIGGER IF EXISTS award_creative_t ON public.gallery_contest_entries;
DROP TRIGGER IF EXISTS trg_gce_require_content ON public.gallery_contest_entries;

-- Seed missing badges (so safe_award_badge actually inserts)
INSERT INTO public.badges (id, name, icon, color, audience, description) VALUES
  ('first_competition', 'أول مسابقة', '🏁', 'violet', 'teacher', 'أنشأ أول مسابقة'),
  ('first_quiz_made', 'أول اختبار', '📝', 'sky', 'teacher', 'أنشأ أول اختبار'),
  ('first_assignment', 'أول واجب', '📚', 'emerald', 'teacher', 'أنشأ أول واجب'),
  ('certificate_giver', 'مانح الشهادات', '🎖️', 'amber', 'teacher', 'منح شهادة لطالب'),
  ('top_teacher', 'المعلم المتميز', '👑', 'amber', 'teacher', 'الأعلى نقاطاً هذا الأسبوع'),
  ('first_activity', 'أول نشاط', '🌱', 'emerald', 'student', 'أضاف أول نشاط'),
  ('five_activities', 'خمسة أنشطة', '🌿', 'emerald', 'student', 'أضاف 5 أنشطة'),
  ('ten_activities', 'عشرة أنشطة', '🌳', 'emerald', 'student', '10 أنشطة معتمدة'),
  ('first_comment', 'أول تعليق', '💬', 'sky', 'student', 'كتب أول تعليق'),
  ('competition_winner', 'فائز مسابقة', '🏆', 'amber', 'student', 'أجاب إجابة صحيحة'),
  ('quiz_starter', 'بداية الاختبارات', '✏️', 'sky', 'student', 'حلّ أول اختبار'),
  ('quiz_master', 'بطل الاختبارات', '🎓', 'violet', 'student', 'حلّ 5 اختبارات'),
  ('certificate_holder', 'حائز شهادة', '🏅', 'amber', 'student', 'حصل على شهادة'),
  ('honor_student', 'طالب الشرف', '⭐', 'amber', 'student', 'الأعلى نقاطاً هذا الأسبوع'),
  ('creative', 'مبدع', '🎨', 'pink', 'student', 'شارك في معرض الإبداع')
ON CONFLICT (id) DO NOTHING;

-- Backfill: award first_competition / first_quiz_made / first_assignment to teachers who already created them
INSERT INTO public.user_badges (user_id, badge_id)
SELECT DISTINCT created_by, 'first_competition' FROM public.competitions WHERE created_by IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.user_badges (user_id, badge_id)
SELECT DISTINCT created_by, 'first_quiz_made' FROM public.quizzes WHERE created_by IS NOT NULL
ON CONFLICT DO NOTHING;

INSERT INTO public.user_badges (user_id, badge_id)
SELECT DISTINCT teacher_id, 'first_assignment' FROM public.assignments WHERE teacher_id IS NOT NULL
ON CONFLICT DO NOTHING;
