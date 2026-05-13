CREATE OR REPLACE FUNCTION public.submit_competition_attempt(_competition_id uuid, _answers jsonb, _time_taken_seconds integer)
 RETURNS TABLE(correct_count integer, question_count integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  _secret_raw text;
  _secret_keys jsonb := NULL;
  _key text;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'يجب تسجيل الدخول'; END IF;
  IF EXISTS (SELECT 1 FROM public.competition_submissions WHERE competition_id = _competition_id AND user_id = _uid) THEN
    RAISE EXCEPTION 'لقد شاركت في هذه المسابقة من قبل';
  END IF;
  SELECT questions INTO _qs FROM public.competitions WHERE id = _competition_id;
  IF _qs IS NULL THEN RAISE EXCEPTION 'هذه المسابقة لا تحتوي على أسئلة متعددة'; END IF;

  -- Try to load array of correct keys from competition_secrets (correct keys were stripped from questions on insert/update)
  SELECT correct_answer INTO _secret_raw FROM public.competition_secrets WHERE competition_id = _competition_id;
  IF _secret_raw IS NOT NULL THEN
    BEGIN
      _secret_keys := _secret_raw::jsonb;
      IF jsonb_typeof(_secret_keys) <> 'array' THEN _secret_keys := NULL; END IF;
    EXCEPTION WHEN others THEN _secret_keys := NULL;
    END;
  END IF;

  _total := COALESCE(jsonb_array_length(_qs), 0);
  FOR _q IN SELECT value FROM jsonb_array_elements(_qs) LOOP
    _is_mc := COALESCE((_q->>'is_multiple_choice')::boolean, true);
    _user_ans := COALESCE(_answers->>_i::text, '');

    -- Prefer key from secrets array if available
    _key := NULL;
    IF _secret_keys IS NOT NULL AND jsonb_array_length(_secret_keys) > _i THEN
      _key := _secret_keys->>_i;
    END IF;

    IF _is_mc THEN
      _correct_idx := NULL;
      IF _key IS NOT NULL THEN
        BEGIN _correct_idx := _key::integer; EXCEPTION WHEN others THEN _correct_idx := NULL; END;
      END IF;
      IF _correct_idx IS NULL THEN
        _correct_idx := COALESCE((_q->>'correct_index')::integer, -1);
      END IF;
      IF _user_ans <> '' AND _user_ans = _correct_idx::text THEN _score := _score + 1; END IF;
    ELSE
      _correct_ans := COALESCE(_key, _q->>'correct_answer', '');
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
END $function$;