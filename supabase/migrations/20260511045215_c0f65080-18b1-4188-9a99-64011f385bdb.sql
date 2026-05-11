
-- Enable realtime for relevant tables (ignore if already added)
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT unnest(ARRAY[
    'direct_messages','notifications','messages','activities','activity_comments',
    'competitions','competition_comments','competition_submissions',
    'assignments','assignment_submissions','events',
    'gallery_contests','gallery_contest_entries','gallery_contest_votes','gallery_comments',
    'reactions','user_blocks','quizzes','quiz_attempts','user_badges','profiles'
  ])
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE public.%I REPLICA IDENTITY FULL', t);
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    EXCEPTION WHEN duplicate_object THEN NULL;
             WHEN others THEN NULL;
    END;
  END LOOP;
END $$;

-- Function to let a user delete the whole conversation with another user (only their side allowed by RLS)
CREATE OR REPLACE FUNCTION public.delete_conversation_with(_other uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;
  DELETE FROM public.direct_messages
  WHERE (sender_id = auth.uid() AND receiver_id = _other)
     OR (sender_id = _other AND receiver_id = auth.uid());
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n;
END;
$$;

-- Allow conversation participants to delete any message in their thread (currently only sender can)
DROP POLICY IF EXISTS dm_delete_participants ON public.direct_messages;
CREATE POLICY dm_delete_participants
ON public.direct_messages FOR DELETE
USING (auth.uid() = sender_id OR auth.uid() = receiver_id OR has_role(auth.uid(),'admin'::app_role));
