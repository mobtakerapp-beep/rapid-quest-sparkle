ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_type_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_type_check
  CHECK (role_type IN ('student','teacher','parent','supervisor','admin'));

UPDATE public.profiles p
SET role_type = CASE
  WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=p.id AND ur.role='admin'::app_role) THEN 'admin'
  WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=p.id AND ur.role='supervisor'::app_role) THEN 'supervisor'
  WHEN EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id=p.id AND ur.role='teacher'::app_role) THEN 'teacher'
  ELSE p.role_type
END
WHERE EXISTS (
  SELECT 1 FROM public.user_roles ur
  WHERE ur.user_id=p.id AND ur.role IN ('admin'::app_role,'supervisor'::app_role,'teacher'::app_role)
);

CREATE OR REPLACE FUNCTION public.sync_role_type_from_user_roles()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  PERFORM set_config('app.bypass_profile_guard','on',true);
  IF NEW.role = 'admin'::app_role THEN
    UPDATE public.profiles SET role_type='admin' WHERE id=NEW.user_id;
  ELSIF NEW.role = 'supervisor'::app_role THEN
    UPDATE public.profiles SET role_type='supervisor' WHERE id=NEW.user_id AND role_type<>'admin';
  ELSIF NEW.role = 'teacher'::app_role THEN
    UPDATE public.profiles SET role_type='teacher' WHERE id=NEW.user_id AND role_type NOT IN ('admin','supervisor');
  END IF;
  PERFORM set_config('app.bypass_profile_guard','off',true);
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_sync_role_type ON public.user_roles;
CREATE TRIGGER trg_sync_role_type
AFTER INSERT ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.sync_role_type_from_user_roles();