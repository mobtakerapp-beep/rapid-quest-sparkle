
ALTER TABLE public.competitions ADD COLUMN IF NOT EXISTS questions jsonb;

ALTER TABLE public.competition_submissions
  ADD COLUMN IF NOT EXISTS answers jsonb,
  ADD COLUMN IF NOT EXISTS correct_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS question_count integer DEFAULT 0;

-- Make legacy `answer` nullable so multi-question submissions can omit it
ALTER TABLE public.competition_submissions ALTER COLUMN answer DROP NOT NULL;

-- Function: return competition with questions but strip correct answers for non-creators
CREATE OR REPLACE FUNCTION public.get_competition_for_attempt(_id uuid)
RETURNS TABLE(id uuid, title text, description text, image_url text, created_by uuid, starts_at timestamptz, ends_at timestamptz, questions jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _c public.competitions%ROWTYPE;
  _can_see boolean;
BEGIN
  IF _uid IS NULL THEN RETURN; END IF;
  SELECT * INTO _c FROM public.competitions WHERE competitions.id = _id;
  IF NOT FOUND THEN RETURN; END IF;
  _can_see := (_c.created_by = _uid) OR public.is_teacher(_uid);
  id := _c.id; title := _c.title; description := _c.description;
  image_url := _c.image_url; created_by := _c.created_by;
  starts_at := _c.starts_at; ends_at := _c.ends_at;
  IF _c.questions IS NULL THEN
    questions := NULL;
  ELSIF _can_see THEN
    questions := _c.questions;
  ELSE
    SELECT COALESCE(jsonb_agg(elem - 'correct_index' - 'correct_answer' ORDER BY ord), '[]'::jsonb)
      INTO questions FROM jsonb_array_elements(_c.questions) WITH ORDINALITY AS x(elem, ord);
  END IF;
  RETURN NEXT;
END $$;

-- Function: submit & grade a multi-question competition attempt
CREATE OR REPLACE FUNCTION public.submit_competition_attempt(_competition_id uuid, _answers jsonb, _time_taken_seconds integer)
RETURNS TABLE(correct_count integer, question_count integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _uid uuid := auth.uid();
  _qs jsonb;
  _q jsonb;
  _i integer := 0;
  _is_mc boolean;
  _correct_idx integer;
  _correct_ans text;
  _user_ans text;
  _norm_u text;
  _norm_a text;
  _score integer := 0;
  _total integer := 0;
  _all_correct boolean;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  IF EXISTS (SELECT 1 FROM public.competition_submissions WHERE competition_id = _competition_id AND user_id = _uid) THEN
    RAISE EXCEPTION 'لقد شاركت في هذه المسابقة من قبل';
  END IF;
  SELECT questions INTO _qs FROM public.competitions WHERE id = _competition_id;
  IF _qs IS NULL THEN RAISE EXCEPTION 'هذه المسابقة لا تحتوي على أسئلة متعددة'; END IF;
  _total := COALESCE(jsonb_array_length(_qs), 0);
  FOR _q IN SELECT value FROM jsonb_array_elements(_qs) LOOP
    _is_mc := COALESCE((_q->>'is_multiple_choice')::boolean, true);
    _user_ans := COALESCE(_answers->>_i::text, '');
    IF _is_mc THEN
      _correct_idx := COALESCE((_q->>'correct_index')::integer, -1);
      IF _user_ans <> '' AND _user_ans = _correct_idx::text THEN _score := _score + 1; END IF;
    ELSE
      _correct_ans := COALESCE(_q->>'correct_answer', '');
      _norm_u := lower(regexp_replace(translate(_user_ans, 'ـ٠١٢٣٤٥٦٧٨٩','0123456789'),'\s+','','g'));
      _norm_a := lower(regexp_replace(translate(_correct_ans,'ـ٠١٢٣٤٥٦٧٨٩','0123456789'),'\s+','','g'));
      IF _norm_a <> '' AND _norm_u = _norm_a THEN _score := _score + 1; END IF;
    END IF;
    _i := _i + 1;
  END LOOP;
  _all_correct := (_total > 0 AND _score = _total);
  INSERT INTO public.competition_submissions (competition_id, user_id, answer, answers, correct_count, question_count, time_taken_seconds, is_correct, teacher_approved, approved_by)
  VALUES (_competition_id, _uid, NULL, _answers, _score, _total, _time_taken_seconds, _all_correct, _all_correct, CASE WHEN _all_correct THEN _uid ELSE NULL END);
  correct_count := _score; question_count := _total;
  RETURN NEXT;
END $$;

GRANT EXECUTE ON FUNCTION public.get_competition_for_attempt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_competition_attempt(uuid, jsonb, integer) TO authenticated;
