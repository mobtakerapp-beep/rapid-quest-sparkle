-- Add approved column to messages (for gallery items; default true keeps existing items visible)
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT true;

-- Add approved column to gallery_contest_entries (default false = needs approval)
ALTER TABLE public.gallery_contest_entries ADD COLUMN IF NOT EXISTS approved boolean NOT NULL DEFAULT false;

-- Approve all existing contest entries for backward compatibility
UPDATE public.gallery_contest_entries SET approved = true WHERE approved = false;
