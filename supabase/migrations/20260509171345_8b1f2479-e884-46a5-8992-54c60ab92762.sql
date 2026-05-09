
-- =========================================================
-- AUTH: profile creation on new user
-- =========================================================
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =========================================================
-- PROFILES: guards & class code
-- =========================================================
DROP TRIGGER IF EXISTS trg_profiles_protect_role ON public.profiles;
CREATE TRIGGER trg_profiles_protect_role
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.protect_role_type();

DROP TRIGGER IF EXISTS trg_profiles_protected_cols ON public.profiles;
CREATE TRIGGER trg_profiles_protected_cols
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_protected_cols();

DROP TRIGGER IF EXISTS trg_profiles_ban_guard ON public.profiles;
CREATE TRIGGER trg_profiles_ban_guard
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.guard_profile_ban();

DROP TRIGGER IF EXISTS trg_profiles_class_code ON public.profiles;
CREATE TRIGGER trg_profiles_class_code
BEFORE INSERT OR UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.ensure_teacher_class_code();

-- =========================================================
-- COMPETITIONS
-- =========================================================
DROP TRIGGER IF EXISTS trg_comp_autograde ON public.competition_submissions;
CREATE TRIGGER trg_comp_autograde
BEFORE INSERT ON public.competition_submissions
FOR EACH ROW EXECUTE FUNCTION public.autograde_competition_submission();

DROP TRIGGER IF EXISTS trg_comp_award ON public.competition_submissions;
CREATE TRIGGER trg_comp_award
AFTER INSERT ON public.competition_submissions
FOR EACH ROW EXECUTE FUNCTION public.award_on_competition();

DROP TRIGGER IF EXISTS trg_comp_award_points ON public.competition_submissions;
CREATE TRIGGER trg_comp_award_points
AFTER INSERT ON public.competition_submissions
FOR EACH ROW EXECUTE FUNCTION public.award_competition_points();

DROP TRIGGER IF EXISTS trg_comp_notify_sub ON public.competition_submissions;
CREATE TRIGGER trg_comp_notify_sub
AFTER INSERT ON public.competition_submissions
FOR EACH ROW EXECUTE FUNCTION public.notify_competition_submission();

DROP TRIGGER IF EXISTS trg_comp_notify_correct ON public.competition_submissions;
CREATE TRIGGER trg_comp_notify_correct
AFTER UPDATE ON public.competition_submissions
FOR EACH ROW EXECUTE FUNCTION public.notify_competition_marked_correct();

DROP TRIGGER IF EXISTS trg_comp_award_badge ON public.competition_submissions;
CREATE TRIGGER trg_comp_award_badge
AFTER UPDATE ON public.competition_submissions
FOR EACH ROW EXECUTE FUNCTION public.award_competition_badge();

DROP TRIGGER IF EXISTS trg_comp_new_notify ON public.competitions;
CREATE TRIGGER trg_comp_new_notify
AFTER INSERT ON public.competitions
FOR EACH ROW EXECUTE FUNCTION public.notify_new_competition();

DROP TRIGGER IF EXISTS trg_comp_first_award ON public.competitions;
CREATE TRIGGER trg_comp_first_award
AFTER INSERT ON public.competitions
FOR EACH ROW EXECUTE FUNCTION public.award_teacher_first_competition();

DROP TRIGGER IF EXISTS trg_comp_comment_notify ON public.competition_comments;
CREATE TRIGGER trg_comp_comment_notify
AFTER INSERT ON public.competition_comments
FOR EACH ROW EXECUTE FUNCTION public.notify_new_competition_comment();

DROP TRIGGER IF EXISTS trg_comp_comment_profanity ON public.competition_comments;
CREATE TRIGGER trg_comp_comment_profanity
BEFORE INSERT ON public.competition_comments
FOR EACH ROW EXECUTE FUNCTION public.check_message_profanity();

-- =========================================================
-- ASSIGNMENTS
-- =========================================================
DROP TRIGGER IF EXISTS trg_assign_notify ON public.assignments;
CREATE TRIGGER trg_assign_notify
AFTER INSERT ON public.assignments
FOR EACH ROW EXECUTE FUNCTION public.notify_new_assignment();

DROP TRIGGER IF EXISTS trg_assign_first_award ON public.assignments;
CREATE TRIGGER trg_assign_first_award
AFTER INSERT ON public.assignments
FOR EACH ROW EXECUTE FUNCTION public.award_teacher_first_assignment();

-- =========================================================
-- QUIZZES
-- =========================================================
DROP TRIGGER IF EXISTS trg_quiz_award ON public.quiz_attempts;
CREATE TRIGGER trg_quiz_award
AFTER INSERT ON public.quiz_attempts
FOR EACH ROW EXECUTE FUNCTION public.award_on_quiz();

DROP TRIGGER IF EXISTS trg_quiz_award_points ON public.quiz_attempts;
CREATE TRIGGER trg_quiz_award_points
AFTER INSERT ON public.quiz_attempts
FOR EACH ROW EXECUTE FUNCTION public.award_quiz_points();

DROP TRIGGER IF EXISTS trg_quiz_notify_creator ON public.quiz_attempts;
CREATE TRIGGER trg_quiz_notify_creator
AFTER INSERT ON public.quiz_attempts
FOR EACH ROW EXECUTE FUNCTION public.notify_quiz_creator_on_attempt();

DROP TRIGGER IF EXISTS trg_quiz_notify_teacher ON public.quiz_attempts;
CREATE TRIGGER trg_quiz_notify_teacher
AFTER INSERT ON public.quiz_attempts
FOR EACH ROW EXECUTE FUNCTION public.notify_teacher_on_quiz_attempt();

DROP TRIGGER IF EXISTS trg_quiz_notify_grade ON public.quiz_attempts;
CREATE TRIGGER trg_quiz_notify_grade
AFTER UPDATE ON public.quiz_attempts
FOR EACH ROW EXECUTE FUNCTION public.notify_student_on_grade();

DROP TRIGGER IF EXISTS trg_quiz_first_award ON public.quizzes;
CREATE TRIGGER trg_quiz_first_award
AFTER INSERT ON public.quizzes
FOR EACH ROW EXECUTE FUNCTION public.award_teacher_first_quiz();

-- =========================================================
-- ACTIVITIES
-- =========================================================
DROP TRIGGER IF EXISTS trg_activity_auto_approve ON public.activities;
CREATE TRIGGER trg_activity_auto_approve
BEFORE INSERT ON public.activities
FOR EACH ROW EXECUTE FUNCTION public.auto_approve_activity();

DROP TRIGGER IF EXISTS trg_activity_new_notify ON public.activities;
CREATE TRIGGER trg_activity_new_notify
AFTER INSERT ON public.activities
FOR EACH ROW EXECUTE FUNCTION public.notify_new_activity();

DROP TRIGGER IF EXISTS trg_activity_approved_notify ON public.activities;
CREATE TRIGGER trg_activity_approved_notify
AFTER UPDATE ON public.activities
FOR EACH ROW EXECUTE FUNCTION public.notify_activity_approved();

DROP TRIGGER IF EXISTS trg_activity_award_badges ON public.activities;
CREATE TRIGGER trg_activity_award_badges
AFTER INSERT OR UPDATE ON public.activities
FOR EACH ROW EXECUTE FUNCTION public.award_activity_badges();

DROP TRIGGER IF EXISTS trg_activity_comment_first ON public.activity_comments;
CREATE TRIGGER trg_activity_comment_first
AFTER INSERT ON public.activity_comments
FOR EACH ROW EXECUTE FUNCTION public.award_first_comment();

DROP TRIGGER IF EXISTS trg_activity_comment_profanity ON public.activity_comments;
CREATE TRIGGER trg_activity_comment_profanity
BEFORE INSERT ON public.activity_comments
FOR EACH ROW EXECUTE FUNCTION public.check_message_profanity();

-- =========================================================
-- CERTIFICATES
-- =========================================================
DROP TRIGGER IF EXISTS trg_cert_notify ON public.certificates;
CREATE TRIGGER trg_cert_notify
AFTER INSERT ON public.certificates
FOR EACH ROW EXECUTE FUNCTION public.notify_new_certificate();

DROP TRIGGER IF EXISTS trg_cert_award ON public.certificates;
CREATE TRIGGER trg_cert_award
AFTER INSERT ON public.certificates
FOR EACH ROW EXECUTE FUNCTION public.award_on_certificate();

-- =========================================================
-- BADGES
-- =========================================================
DROP TRIGGER IF EXISTS trg_user_badge_notify ON public.user_badges;
CREATE TRIGGER trg_user_badge_notify
AFTER INSERT ON public.user_badges
FOR EACH ROW EXECUTE FUNCTION public.notify_new_badge();

-- =========================================================
-- DIRECT MESSAGES & MESSAGES
-- =========================================================
DROP TRIGGER IF EXISTS trg_dm_notify ON public.direct_messages;
CREATE TRIGGER trg_dm_notify
AFTER INSERT ON public.direct_messages
FOR EACH ROW EXECUTE FUNCTION public.notify_new_dm();

DROP TRIGGER IF EXISTS trg_dm_profanity ON public.direct_messages;
CREATE TRIGGER trg_dm_profanity
BEFORE INSERT ON public.direct_messages
FOR EACH ROW EXECUTE FUNCTION public.check_message_profanity();

DROP TRIGGER IF EXISTS trg_messages_profanity ON public.messages;
CREATE TRIGGER trg_messages_profanity
BEFORE INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.check_message_profanity();

-- =========================================================
-- GALLERY
-- =========================================================
DROP TRIGGER IF EXISTS trg_gallery_award_creative ON public.gallery_contest_entries;
CREATE TRIGGER trg_gallery_award_creative
AFTER INSERT ON public.gallery_contest_entries
FOR EACH ROW EXECUTE FUNCTION public.award_creative();

DROP TRIGGER IF EXISTS trg_gallery_require_content ON public.gallery_contest_entries;
CREATE TRIGGER trg_gallery_require_content
BEFORE INSERT ON public.gallery_contest_entries
FOR EACH ROW EXECUTE FUNCTION public.gce_require_content();

DROP TRIGGER IF EXISTS trg_gallery_comment_profanity ON public.gallery_comments;
CREATE TRIGGER trg_gallery_comment_profanity
BEFORE INSERT ON public.gallery_comments
FOR EACH ROW EXECUTE FUNCTION public.check_message_profanity();

-- =========================================================
-- PROFILES_PRIVATE
-- =========================================================
DROP TRIGGER IF EXISTS trg_profiles_private_touch ON public.profiles_private;
CREATE TRIGGER trg_profiles_private_touch
BEFORE UPDATE ON public.profiles_private
FOR EACH ROW EXECUTE FUNCTION public.touch_profiles_private_updated_at();
