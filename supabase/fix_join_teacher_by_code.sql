-- ============================================================
-- إصلاح دالة join_teacher_by_code
-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/qysyunyewjvggazhukmm/sql/new
-- ============================================================

-- المشكلة: الدالة كانت تفتش في profiles.role_type فقط،
-- لكن بعض حسابات المعلمين دورهم محفوظ في user_roles فقط.
-- الحل: تفتش في الاثنين معاً.

CREATE OR REPLACE FUNCTION public.join_teacher_by_code(_code text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _uid uuid := auth.uid(); _tid uuid;
BEGIN
  IF _uid IS NULL THEN RETURN false; END IF;
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
