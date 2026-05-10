
DROP POLICY IF EXISTS profiles_select_public_basic ON public.profiles;
CREATE POLICY profiles_select_authenticated ON public.profiles
  FOR SELECT TO authenticated
  USING (true);

REVOKE SELECT ON public.profiles FROM anon;
