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

  IF NOT EXISTS (SELECT 1 FROM public.badges WHERE id = _badge_id) THEN
    RETURN;
  END IF;

  -- Automatic badges should be granted once only; teacher-granted badges may be repeated.
  IF _awarded_by IS NULL AND EXISTS (
    SELECT 1 FROM public.user_badges
    WHERE user_id = _user_id AND badge_id = _badge_id AND awarded_by IS NULL
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.user_badges(user_id, badge_id, awarded_by)
  VALUES (_user_id, _badge_id, _awarded_by);
END;
$$;

DROP TRIGGER IF EXISTS award_teacher_first_assign_t ON public.assignments;
DROP TRIGGER IF EXISTS award_teacher_first_comp_t ON public.competitions;