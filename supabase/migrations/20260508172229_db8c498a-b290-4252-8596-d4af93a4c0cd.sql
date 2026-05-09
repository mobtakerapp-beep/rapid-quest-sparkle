
-- realtime (skip if already added)
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.direct_messages;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.direct_messages REPLICA IDENTITY FULL;

ALTER TABLE public.user_badges ADD COLUMN IF NOT EXISTS awarded_by uuid;

DELETE FROM public.user_badges a
USING public.user_badges b
WHERE a.user_id = b.user_id
  AND a.badge_id = b.badge_id
  AND a.id <> b.id
  AND a.earned_at > b.earned_at
  AND a.awarded_by IS NULL
  AND b.awarded_by IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS user_badges_system_unique
  ON public.user_badges(user_id, badge_id)
  WHERE awarded_by IS NULL;

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
BEGIN
  SELECT id INTO top_student FROM public.profiles
    WHERE role_type = 'student' OR role_type IS NULL
    ORDER BY points DESC NULLS LAST LIMIT 1;
  SELECT id INTO top_teacher FROM public.profiles
    WHERE role_type IN ('teacher','supervisor')
    ORDER BY points DESC NULLS LAST LIMIT 1;

  IF top_student IS NOT NULL THEN
    DELETE FROM public.user_badges WHERE badge_id = 'honor_student' AND user_id <> top_student AND awarded_by IS NULL;
    INSERT INTO public.user_badges(user_id, badge_id) VALUES (top_student, 'honor_student') ON CONFLICT DO NOTHING;
    IF NOT EXISTS (SELECT 1 FROM public.weekly_top WHERE user_id = top_student AND week_start = cur_week) THEN
      INSERT INTO public.weekly_top(user_id, week_start, points, role_type)
      SELECT top_student, cur_week, points, 'student' FROM public.profiles WHERE id = top_student;
    END IF;
  END IF;

  IF top_teacher IS NOT NULL THEN
    DELETE FROM public.user_badges WHERE badge_id = 'top_teacher' AND user_id <> top_teacher AND awarded_by IS NULL;
    INSERT INTO public.user_badges(user_id, badge_id) VALUES (top_teacher, 'top_teacher') ON CONFLICT DO NOTHING;
    IF NOT EXISTS (SELECT 1 FROM public.weekly_top WHERE user_id = top_teacher AND week_start = cur_week) THEN
      INSERT INTO public.weekly_top(user_id, week_start, points, role_type)
      SELECT top_teacher, cur_week, points, 'teacher' FROM public.profiles WHERE id = top_teacher;
    END IF;
  END IF;

  RETURN jsonb_build_object('top_student', top_student, 'top_teacher', top_teacher);
END $function$;

-- de-dup weekly_top by (user_id, week_start) keeping the earliest created row
DELETE FROM public.weekly_top wt
WHERE wt.id NOT IN (
  SELECT DISTINCT ON (user_id, week_start) id
  FROM public.weekly_top
  ORDER BY user_id, week_start, created_at ASC
);
CREATE UNIQUE INDEX IF NOT EXISTS weekly_top_user_week_unique
  ON public.weekly_top(user_id, week_start);

-- de-dup honor_student / top_teacher badges
DELETE FROM public.user_badges ub
WHERE ub.badge_id IN ('honor_student','top_teacher')
  AND ub.id NOT IN (
    SELECT DISTINCT ON (user_id, badge_id) id
    FROM public.user_badges
    WHERE badge_id IN ('honor_student','top_teacher')
    ORDER BY user_id, badge_id, earned_at ASC
  );

CREATE TABLE IF NOT EXISTS public.ai_image_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.ai_image_usage ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY aiu_select_own ON public.ai_image_usage FOR SELECT USING (auth.uid() = user_id);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS ai_image_usage_user_day ON public.ai_image_usage(user_id, created_at);
