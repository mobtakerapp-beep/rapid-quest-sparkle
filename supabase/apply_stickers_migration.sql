-- ============================================================
-- ملصقات المعلم — teacher_stickers migration
-- Run this in the Supabase SQL Editor:
-- https://supabase.com/dashboard/project/qysyunyewjvggazhukmm/sql/new
-- ============================================================

create table if not exists public.teacher_stickers (
  id uuid primary key default gen_random_uuid(),
  teacher_id uuid not null references public.profiles(id) on delete cascade,
  student_id uuid not null references public.profiles(id) on delete cascade,
  image_url text not null,
  title text not null default '',
  message text not null default '',
  created_at timestamptz not null default now()
);

alter table public.teacher_stickers enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='teacher_stickers' and policyname='teachers can send stickers') then
    create policy "teachers can send stickers"
      on public.teacher_stickers for insert
      with check (auth.uid() = teacher_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='teacher_stickers' and policyname='teachers can view sent stickers') then
    create policy "teachers can view sent stickers"
      on public.teacher_stickers for select
      using (auth.uid() = teacher_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='teacher_stickers' and policyname='students can view received stickers') then
    create policy "students can view received stickers"
      on public.teacher_stickers for select
      using (auth.uid() = student_id);
  end if;
  if not exists (select 1 from pg_policies where tablename='teacher_stickers' and policyname='teachers can delete stickers') then
    create policy "teachers can delete stickers"
      on public.teacher_stickers for delete
      using (auth.uid() = teacher_id);
  end if;
end $$;
