-- Fix join_teacher_by_code to check both profiles.role_type AND user_roles table
-- Previously it only checked profiles.role_type which could be NULL even for valid teachers
CREATE OR REPLACE FUNCTION public.join_teacher_by_code(_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _tid uuid;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
  -- Check profiles.role_type OR user_roles (via is_teacher) so both role-storage methods work
  SELECT id INTO _tid FROM public.profiles
   WHERE class_code = upper(trim(_code))
     AND (
       role_type IN ('teacher', 'admin', 'supervisor')
       OR public.is_teacher(id)
     )
   LIMIT 1;
  IF _tid IS NULL THEN RETURN false; END IF;
  UPDATE public.profiles SET teacher_id = _tid WHERE id = _uid;
  RETURN true;
END; $$;

REVOKE EXECUTE ON FUNCTION public.join_teacher_by_code(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.join_teacher_by_code(text) TO authenticated;
