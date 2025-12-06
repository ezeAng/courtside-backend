CREATE OR REPLACE FUNCTION get_win_rate_last10(user_auth_id TEXT)
RETURNS NUMERIC
LANGUAGE SQL STABLE AS $$
SELECT
  CASE
    WHEN COUNT(*) = 0 THEN 0
    ELSE SUM(CASE WHEN winner_id = user_auth_id THEN 1 ELSE 0 END)::NUMERIC / COUNT(*)
  END
FROM (
  SELECT winner_id, loser_id
  FROM matches
  WHERE winner_id = user_auth_id OR loser_id = user_auth_id
  ORDER BY created_at DESC
  LIMIT 10
) AS t;
$$;

CREATE OR REPLACE FUNCTION get_best_match(user_auth_id TEXT)
RETURNS TABLE (
  winner_username TEXT,
  loser_username TEXT,
  scores TEXT
)
LANGUAGE SQL STABLE AS $$
SELECT
  u1.username AS winner_username,
  u2.username AS loser_username,
  m.scores
FROM matches m
LEFT JOIN users u1 ON u1.auth_id = m.winner_id
LEFT JOIN users u2 ON u2.auth_id = m.loser_id
WHERE m.winner_id = user_auth_id OR m.loser_id = user_auth_id
ORDER BY m.created_at DESC
LIMIT 1;
$$;
