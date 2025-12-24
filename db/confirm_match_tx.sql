CREATE OR REPLACE FUNCTION public.confirm_match_tx(
  p_match_id uuid,
  p_discipline text,
  p_updates jsonb,
  p_played_at timestamptz,
  p_confirmed_at timestamptz,
  p_elo_change_side_a int,
  p_elo_change_side_b int
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_update jsonb;
  v_auth_id uuid;
  v_old_elo int;
  v_new_elo int;
  v_singles_elo int;
  v_doubles_elo int;
  v_singles_matches int;
  v_doubles_matches int;
  v_old_overall int;
  v_new_overall int;
  v_total_matches int;
BEGIN
  IF p_discipline NOT IN ('singles', 'doubles') THEN
    RAISE EXCEPTION 'Invalid discipline %', p_discipline;
  END IF;

  FOR v_update IN SELECT * FROM jsonb_array_elements(p_updates)
  LOOP
    v_auth_id := (v_update->>'auth_id')::uuid;
    v_old_elo := (v_update->>'old_elo')::int;
    v_new_elo := (v_update->>'new_elo')::int;

    SELECT
      u.singles_elo,
      u.doubles_elo,
      COALESCE(u.singles_matches_played, 0),
      COALESCE(u.doubles_matches_played, 0),
      u.overall_elo
    INTO
      v_singles_elo,
      v_doubles_elo,
      v_singles_matches,
      v_doubles_matches,
      v_old_overall
    FROM public.users u
    WHERE u.auth_id = v_auth_id
    FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'User % not found for match confirmation', v_auth_id;
    END IF;

    v_singles_elo := COALESCE(v_singles_elo, 1000);
    v_doubles_elo := COALESCE(v_doubles_elo, 1000);

    IF p_discipline = 'singles' THEN
      v_singles_matches := v_singles_matches + 1;
      v_singles_elo := v_new_elo;
    ELSE
      v_doubles_matches := v_doubles_matches + 1;
      v_doubles_elo := v_new_elo;
    END IF;

    v_total_matches := v_singles_matches + v_doubles_matches;
    IF v_total_matches > 0 THEN
      v_new_overall := ROUND(
        ((v_singles_elo * v_singles_matches)::numeric + (v_doubles_elo * v_doubles_matches)::numeric) /
        v_total_matches
      );
    ELSE
      v_new_overall := NULL;
    END IF;

    UPDATE public.users u
    SET
      singles_elo = v_singles_elo,
      doubles_elo = v_doubles_elo,
      singles_matches_played = v_singles_matches,
      doubles_matches_played = v_doubles_matches,
      overall_elo = v_new_overall
    WHERE u.auth_id = v_auth_id;

    INSERT INTO public.elo_history (
      auth_id,
      match_id,
      discipline,
      old_elo,
      new_elo,
      old_overall_elo,
      new_overall_elo,
      created_at
    )
    VALUES (
      v_auth_id,
      p_match_id,
      p_discipline,
      v_old_elo,
      v_new_elo,
      v_old_overall,
      v_new_overall,
      p_played_at
    )
    ON CONFLICT (auth_id, match_id) DO UPDATE
    SET
      old_elo = EXCLUDED.old_elo,
      new_elo = EXCLUDED.new_elo,
      discipline = EXCLUDED.discipline,
      old_overall_elo = EXCLUDED.old_overall_elo,
      new_overall_elo = EXCLUDED.new_overall_elo,
      created_at = EXCLUDED.created_at;
  END LOOP;

  UPDATE public.matches m
  SET
    status = 'confirmed',
    confirmed_at = p_confirmed_at,
    elo_change_side_a = p_elo_change_side_a,
    elo_change_side_b = p_elo_change_side_b
  WHERE m.match_id = p_match_id;

  RETURN jsonb_build_object('updated', jsonb_array_length(p_updates));
END;
$$;
