CREATE OR REPLACE FUNCTION public.get_elo_series(
  p_auth_id uuid,
  p_range text,
  p_tz text DEFAULT 'Asia/Singapore',
  p_max_points int DEFAULT 400
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_now timestamptz := now();
  v_start timestamptz;
  v_bucket_interval interval;
  v_bucket_label text;
  v_has_data boolean;
  v_baseline_elo int;
  v_points jsonb;
  v_summary jsonb;
BEGIN
  -- Validate range
  IF p_range NOT IN ('1D','1W','1M','YTD','ALL') THEN
    RAISE EXCEPTION 'Invalid range: %', p_range;
  END IF;

  -- Detect if any elo history exists
  SELECT EXISTS (
    SELECT 1 FROM public.elo_history eh WHERE eh.auth_id = p_auth_id
  ) INTO v_has_data;

  IF NOT v_has_data THEN
    RETURN jsonb_build_object(
      'has_data', false,
      'range', p_range,
      'timezone', p_tz,
      'bucket', NULL,
      'points', '[]'::jsonb,
      'summary', NULL
    );
  END IF;

  -- Compute range start (calendar logic in SG timezone for 1D and YTD)
  IF p_range = '1D' THEN
    v_start := (date_trunc('day', (v_now AT TIME ZONE p_tz)) AT TIME ZONE p_tz);
    v_bucket_interval := interval '1 hour';
    v_bucket_label := 'hour';
  ELSIF p_range = '1W' THEN
    v_start := v_now - interval '7 days';
    v_bucket_interval := interval '1 day';
    v_bucket_label := 'day';
  ELSIF p_range = '1M' THEN
    v_start := v_now - interval '1 month';
    v_bucket_interval := interval '1 day';
    v_bucket_label := 'day';
  ELSIF p_range = 'YTD' THEN
    v_start := (date_trunc('year', (v_now AT TIME ZONE p_tz)) AT TIME ZONE p_tz);
    v_bucket_interval := interval '1 week';
    v_bucket_label := 'week';
  ELSE -- ALL
    SELECT COALESCE(MIN(eh.created_at), v_now - interval '1 year')
      INTO v_start
    FROM public.elo_history eh
    WHERE eh.auth_id = p_auth_id;

    v_bucket_interval := interval '1 week';
    v_bucket_label := 'week';
  END IF;

  -- Baseline elo at range start: last known new_elo before start, else earliest old_elo, else fallback 1000
  SELECT eh.new_elo
    INTO v_baseline_elo
  FROM public.elo_history eh
  WHERE eh.auth_id = p_auth_id
    AND eh.created_at < v_start
  ORDER BY eh.created_at DESC
  LIMIT 1;

  IF v_baseline_elo IS NULL THEN
    SELECT COALESCE(
      (SELECT eh2.old_elo
         FROM public.elo_history eh2
         WHERE eh2.auth_id = p_auth_id
         ORDER BY eh2.created_at ASC
         LIMIT 1),
      1000
    )
    INTO v_baseline_elo;
  END IF;

  -- Build continuous series:
  -- For each bucket timestamp, pick the latest elo_history <= bucket_end, else carry-forward baseline.
  WITH buckets AS (
    SELECT gs AS bucket_end
    FROM generate_series(v_start, v_now, v_bucket_interval) gs
    LIMIT p_max_points
  ),
  bucket_elos AS (
    SELECT
      b.bucket_end,
      COALESCE(
        (
          SELECT eh.new_elo
          FROM public.elo_history eh
          WHERE eh.auth_id = p_auth_id
            AND eh.created_at <= b.bucket_end
          ORDER BY eh.created_at DESC
          LIMIT 1
        ),
        v_baseline_elo
      ) AS elo
    FROM buckets b
  )
  SELECT jsonb_agg(
    jsonb_build_object(
      't', to_char(bucket_end AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"'),
      'elo', elo
    )
    ORDER BY bucket_end ASC
  )
  INTO v_points
  FROM bucket_elos;

  -- Summary for UI (delta + min/max)
  WITH pts AS (
    SELECT
      (elem->>'t')::text AS t,
      (elem->>'elo')::int AS elo
    FROM jsonb_array_elements(v_points) elem
  ),
  agg AS (
    SELECT
      (SELECT elo FROM pts ORDER BY t ASC LIMIT 1) AS start_elo,
      (SELECT elo FROM pts ORDER BY t DESC LIMIT 1) AS end_elo,
      (SELECT MIN(elo) FROM pts) AS min_elo,
      (SELECT MAX(elo) FROM pts) AS max_elo
  )
  SELECT jsonb_build_object(
    'startElo', start_elo,
    'endElo', end_elo,
    'change', (end_elo - start_elo),
    'changePct', CASE WHEN start_elo = 0 THEN NULL ELSE ROUND(((end_elo - start_elo)::numeric / start_elo::numeric) * 100, 2) END,
    'minElo', min_elo,
    'maxElo', max_elo
  )
  INTO v_summary
  FROM agg;

  RETURN jsonb_build_object(
    'has_data', true,
    'range', p_range,
    'timezone', p_tz,
    'bucket', v_bucket_label,
    'points', COALESCE(v_points, '[]'::jsonb),
    'summary', v_summary
  );
END;
$$;

CREATE INDEX IF NOT EXISTS idx_elo_history_auth_created_at
ON public.elo_history (auth_id, created_at DESC);
