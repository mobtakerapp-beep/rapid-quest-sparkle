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

-- Teachers can insert stickers for their students
create policy "teachers can send stickers"
  on public.teacher_stickers for insert
  with check (auth.uid() = teacher_id);

-- Teachers can view stickers they sent
create policy "teachers can view sent stickers"
  on public.teacher_stickers for select
  using (auth.uid() = teacher_id);

-- Students can view stickers sent to them
create policy "students can view received stickers"
  on public.teacher_stickers for select
  using (auth.uid() = student_id);

-- Teachers can delete their own stickers
create policy "teachers can delete stickers"
  on public.teacher_stickers for delete
  using (auth.uid() = teacher_id);

-- Storage bucket policy: allow authenticated users to upload sticker images
insert into storage.buckets (id, name, public)
  values ('stickers', 'stickers', true)
  on conflict (id) do nothing;

create policy "authenticated can upload stickers"
  on storage.objects for insert
  with check (bucket_id = 'stickers' and auth.role() = 'authenticated');

create policy "stickers are public"
  on storage.objects for select
  using (bucket_id = 'stickers');

create policy "owners can delete sticker files"
  on storage.objects for delete
  using (bucket_id = 'stickers' and auth.uid()::text = (storage.foldername(name))[1]);
