-- Fix: competition_secrets FK constraint must be DEFERRABLE so that
-- the BEFORE INSERT trigger on competitions can insert into competition_secrets
-- (at trigger time the parent row doesn't exist yet in the table).

ALTER TABLE public.competition_secrets
  DROP CONSTRAINT IF EXISTS competition_secrets_competition_id_fkey;

ALTER TABLE public.competition_secrets
  ADD CONSTRAINT competition_secrets_competition_id_fkey
    FOREIGN KEY (competition_id)
    REFERENCES public.competitions(id)
    ON DELETE CASCADE
    DEFERRABLE INITIALLY DEFERRED;
