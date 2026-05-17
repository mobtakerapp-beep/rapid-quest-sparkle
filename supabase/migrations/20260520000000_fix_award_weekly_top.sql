-- Fix award_weekly_top: use ON CONFLICT DO UPDATE so re-running in the same week
-- updates the winner instead of throwing a duplicate key violation.
CREATE OR REPLACE FUNCTION public.award_weekly_top()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  top_student uuid;
  top_teacher uuid;
  cur_week date := date_trunc('week', now())::date;
  s_pts int;
  t_pts int;
BEGIN
  SELECT id, points INTO top_student, s_pts FROM public.profiles
    WHERE role_type = 'student' OR role_type IS NULL
    ORDER BY points DESC NULLS LAST LIMIT 1;

  SELECT id, points INTO top_teacher, t_pts FROM public.profiles
    WHERE role_type IN ('teacher','supervisor')
    ORDER BY points DESC NULLS LAST LIMIT 1;

  IF top_student IS NOT NULL THEN
    DELETE FROM public.user_badges
      WHERE badge_id = 'honor_student' AND user_id <> top_student AND awarded_by IS NULL;
    INSERT INTO public.user_badges(user_id, badge_id)
      VALUES (top_student, 'honor_student') ON CONFLICT DO NOTHING;
    INSERT INTO public.weekly_top(user_id, week_start, points, role_type)
      VALUES (top_student, cur_week, COALESCE(s_pts, 0), 'student')
      ON CONFLICT (week_start, role_type)
        DO UPDATE SET user_id = EXCLUDED.user_id, points = EXCLUDED.points;
  END IF;

  IF top_teacher IS NOT NULL THEN
    DELETE FROM public.user_badges
      WHERE badge_id = 'top_teacher' AND user_id <> top_teacher AND awarded_by IS NULL;
    INSERT INTO public.user_badges(user_id, badge_id)
      VALUES (top_teacher, 'top_teacher') ON CONFLICT DO NOTHING;
    INSERT INTO public.weekly_top(user_id, week_start, points, role_type)
      VALUES (top_teacher, cur_week, COALESCE(t_pts, 0), 'teacher')
      ON CONFLICT (week_start, role_type)
        DO UPDATE SET user_id = EXCLUDED.user_id, points = EXCLUDED.points;
  END IF;

  RETURN jsonb_build_object('top_student', top_student, 'top_teacher', top_teacher);
END $function$;
