CREATE OR REPLACE FUNCTION public.get_elo_series(
  p_auth_id uuid,
  p_range text DEFAULT '1M',
  p_tz text DEFAULT 'UTC',
  p_elo_type text DEFAULT 'overall'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now timestamptz := now();
  v_range text := upper(COALESCE(NULLIF(p_range, ''), '1M'));
  v_elo_type text := lower(COALESCE(NULLIF(p_elo_type, ''), 'overall'));
  v_start timestamptz;
  v_start_bucket timestamptz;
  v_end_bucket timestamptz;
  v_bucket_label text := 'day';
  v_has_data boolean;
  v_baseline_elo int;
  v_baseline_time timestamptz;
  v_points jsonb;
BEGIN
  -- Normalize params
  IF v_range NOT IN ('1W','1M','3M','6M','1Y') THEN
    v_range := '1M';
  END IF;

  IF v_elo_type NOT IN ('overall','singles','doubles') THEN
    v_elo_type := 'overall';
  END IF;

  -- Detect if any elo history exists for the selected discipline
  WITH history AS (
    SELECT 1
    FROM public.elo_history eh
    WHERE eh.auth_id = p_auth_id
      AND (v_elo_type = 'overall' OR eh.discipline = v_elo_type)
    LIMIT 1
  )
  SELECT EXISTS (SELECT 1 FROM history) INTO v_has_data;

  IF NOT v_has_data THEN
    RETURN jsonb_build_object(
      'range', v_range,
      'elo_type', v_elo_type,
      'bucket', v_bucket_label,
      'points', '[]'::jsonb
    );
  END IF;

  -- Compute range start
  v_start := v_now - CASE v_range
    WHEN '1W' THEN interval '7 days'
    WHEN '1M' THEN interval '1 month'
    WHEN '3M' THEN interval '3 months'
    WHEN '6M' THEN interval '6 months'
    WHEN '1Y' THEN interval '1 year'
  END;

  v_start_bucket := (date_trunc('day', (v_start AT TIME ZONE p_tz)) AT TIME ZONE p_tz);
  v_end_bucket := (date_trunc('day', (v_now AT TIME ZONE p_tz)) AT TIME ZONE p_tz);
  v_baseline_time := v_start_bucket - interval '1 second';

  -- Baseline elo at range start: last known value before start, else earliest old, else fallback 1000
  WITH history AS (
    SELECT
      eh.created_at,
      CASE WHEN v_elo_type = 'overall' THEN eh.new_overall_elo ELSE eh.new_elo END AS new_value,
      CASE WHEN v_elo_type = 'overall' THEN eh.old_overall_elo ELSE eh.old_elo END AS old_value
    FROM public.elo_history eh
    WHERE eh.auth_id = p_auth_id
      AND (v_elo_type = 'overall' OR eh.discipline = v_elo_type)
  )
  SELECT COALESCE(
    (SELECT h.new_value
       FROM history h
       WHERE h.created_at < v_start_bucket
       ORDER BY h.created_at DESC
       LIMIT 1),
    (SELECT h.old_value
       FROM history h
       ORDER BY h.created_at ASC
       LIMIT 1),
    1000
  )
  INTO v_baseline_elo;

  -- Build daily series with end-of-day values and baseline before range
  WITH history AS (
    SELECT
      eh.created_at,
      COALESCE(
        CASE WHEN v_elo_type = 'overall' THEN eh.new_overall_elo ELSE eh.new_elo END,
        CASE WHEN v_elo_type = 'overall' THEN eh.old_overall_elo ELSE eh.old_elo END
      ) AS value
    FROM public.elo_history eh
    WHERE eh.auth_id = p_auth_id
      AND (v_elo_type = 'overall' OR eh.discipline = v_elo_type)
  ),
  buckets AS (
    SELECT generate_series(v_start_bucket, v_end_bucket, interval '1 day') AS bucket_start
  ),
  bucket_elos AS (
    SELECT
      (b.bucket_start + interval '1 day') AS bucket_end,
      COALESCE(
        (
          SELECT h.value
          FROM history h
          WHERE h.created_at <= (b.bucket_start + interval '1 day')
          ORDER BY h.created_at DESC
          LIMIT 1
        ),
        v_baseline_elo
      ) AS elo
    FROM buckets b
  )
  SELECT jsonb_agg(p ORDER BY p->>'t')
  INTO v_points
  FROM (
    SELECT jsonb_build_object(
      't', to_char(v_baseline_time AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'elo', v_baseline_elo
    ) AS p
    UNION ALL
    SELECT jsonb_build_object(
      't', to_char(bucket_end AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'elo', elo
    ) AS p
    FROM bucket_elos
  ) s;

  RETURN jsonb_build_object(
    'range', v_range,
    'elo_type', v_elo_type,
    'bucket', v_bucket_label,
    'points', COALESCE(v_points, '[]'::jsonb)
  );
END;
$$;

CREATE INDEX IF NOT EXISTS idx_elo_history_auth_created_at
ON public.elo_history (auth_id, created_at DESC);
