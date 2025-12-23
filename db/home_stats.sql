CREATE OR REPLACE FUNCTION get_home_stats(user_auth_id TEXT)
RETURNS TABLE (
  current_elo INTEGER,
  rank INTEGER,
  matches_this_week INTEGER,
  win_rate_last_10 NUMERIC
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  user_gender TEXT;
BEGIN
  -- Get current singles ELO and gender
  SELECT u.singles_elo, u.gender INTO current_elo, user_gender
  FROM users u
  WHERE u.auth_id = user_auth_id;

  IF current_elo IS NULL THEN
    RAISE EXCEPTION 'User not found for auth_id %', user_auth_id;
  END IF;

  -- Rank: count how many users have higher singles_elo in same gender category
  SELECT 1 + COUNT(*)
  INTO rank
  FROM users
  WHERE gender = user_gender
    AND singles_elo > current_elo;

  -- Matches this week: last 7 days
  SELECT COUNT(*)
  INTO matches_this_week
  FROM matches
  WHERE (winner_id = user_auth_id OR loser_id = user_auth_id)
    AND created_at >= NOW() - INTERVAL '7 days';

  -- Win rate of last 10 matches
  SELECT
    CASE
      WHEN COUNT(*) = 0 THEN 0
      ELSE SUM(CASE WHEN winner_id = user_auth_id THEN 1 ELSE 0 END)::NUMERIC / COUNT(*)
    END
  INTO win_rate_last_10
  FROM (
    SELECT winner_id, loser_id
    FROM matches
    WHERE winner_id = user_auth_id OR loser_id = user_auth_id
    ORDER BY created_at DESC
    LIMIT 10
  ) AS last10;

  RETURN NEXT;
END;
$$;
