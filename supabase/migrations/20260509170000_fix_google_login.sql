-- نسخه آمنه من handle_new_user — لا تكسر تسجيل الدخول أبداً
-- شغّل هذا في Supabase SQL Editor

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'default';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS warning_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO public.profiles (id, display_name, avatar_url, theme, points, warning_count, is_banned)
    VALUES (
      NEW.id,
      COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        split_part(NEW.email, '@', 1)
      ),
      NEW.raw_user_meta_data->>'avatar_url',
      'default', 0, 0, false
    )
    ON CONFLICT (id) DO UPDATE SET
      display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name),
      avatar_url   = COALESCE(public.profiles.avatar_url,   EXCLUDED.avatar_url);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user profile insert failed: %', SQLERRM;
  END;

  BEGIN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user')
    ON CONFLICT DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user role insert failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
