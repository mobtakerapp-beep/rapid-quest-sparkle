ALTER TABLE public.activities ALTER COLUMN file_url DROP NOT NULL;
ALTER TABLE public.activities ALTER COLUMN file_type DROP NOT NULL;
ALTER TABLE public.activities ALTER COLUMN file_url SET DEFAULT NULL;
ALTER TABLE public.activities ALTER COLUMN file_type SET DEFAULT NULL;