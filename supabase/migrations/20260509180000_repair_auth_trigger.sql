-- إصلاح شامل وآمن لتسجيل الدخول/إنشاء الحساب بالإيميل و Google.
-- شغّلي الملف بالكامل مرة واحدة في SQL Editor.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_type
    WHERE typnamespace = 'public'::regnamespace AND typname = 'app_role'
  ) THEN
    CREATE TYPE public.app_role AS ENUM ('admin', 'user', 'teacher', 'supervisor');
  END IF;
END $$;

DO $$
BEGIN
  BEGIN ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'teacher'; EXCEPTION WHEN OTHERS THEN NULL; END;
  BEGIN ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'supervisor'; EXCEPTION WHEN OTHERS THEN NULL; END;
END $$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY,
  display_name TEXT,
  avatar_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS theme TEXT NOT NULL DEFAULT 'default';
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS warning_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS is_banned BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS level INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS role_type TEXT;

ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_type_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_type_check
  CHECK (role_type IS NULL OR role_type IN ('teacher','student','parent','supervisor'));

CREATE TABLE IF NOT EXISTS public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  role public.app_role NOT NULL DEFAULT 'user',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'role'
  ) THEN
    EXECUTE 'ALTER TABLE public.profiles ALTER COLUMN role SET DEFAULT ''user''';
    EXECUTE 'UPDATE public.profiles SET role = COALESCE(role, ''user'') WHERE role IS NULL';
  END IF;
END $$;

UPDATE public.profiles
SET theme = COALESCE(theme, 'default'),
    points = COALESCE(points, 0),
    warning_count = COALESCE(warning_count, 0),
    is_banned = COALESCE(is_banned, false),
    level = COALESCE(level, 1);

ALTER TABLE public.profiles ALTER COLUMN theme SET DEFAULT 'default';
ALTER TABLE public.profiles ALTER COLUMN points SET DEFAULT 0;
ALTER TABLE public.profiles ALTER COLUMN warning_count SET DEFAULT 0;
ALTER TABLE public.profiles ALTER COLUMN is_banned SET DEFAULT false;
ALTER TABLE public.profiles ALTER COLUMN level SET DEFAULT 1;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

CREATE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    INSERT INTO public.profiles (
      id,
      display_name,
      avatar_url,
      theme,
      points,
      warning_count,
      is_banned,
      level,
      role_type
    )
    VALUES (
      NEW.id,
      COALESCE(
        NEW.raw_user_meta_data->>'full_name',
        NEW.raw_user_meta_data->>'name',
        split_part(COALESCE(NEW.email, ''), '@', 1),
        'مستخدم جديد'
      ),
      NEW.raw_user_meta_data->>'avatar_url',
      'default',
      0,
      0,
      false,
      1,
      'student'
    )
    ON CONFLICT (id) DO UPDATE SET
      display_name = COALESCE(public.profiles.display_name, EXCLUDED.display_name),
      avatar_url = COALESCE(public.profiles.avatar_url, EXCLUDED.avatar_url),
      theme = COALESCE(public.profiles.theme, 'default'),
      points = COALESCE(public.profiles.points, 0),
      warning_count = COALESCE(public.profiles.warning_count, 0),
      is_banned = COALESCE(public.profiles.is_banned, false),
      level = COALESCE(public.profiles.level, 1),
      role_type = COALESCE(public.profiles.role_type, 'student');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user profile insert failed: %', SQLERRM;
  END;

  BEGIN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'user'::public.app_role)
    ON CONFLICT (user_id, role) DO NOTHING;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user role insert failed: %', SQLERRM;
  END;

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
