-- Recent matches view
CREATE OR REPLACE VIEW recent_matches_view AS
SELECT
  m.match_id,
  m.created_at,
  m.gender,
  m.category,
  m.winner_id,
  m.loser_id,
  m.scores,
  u1.username AS winner_username,
  u2.username AS loser_username
FROM matches m
LEFT JOIN users u1 ON u1.auth_id = m.winner_id
LEFT JOIN users u2 ON u2.auth_id = m.loser_id
ORDER BY m.created_at DESC;

-- Head-to-head records function
CREATE OR REPLACE FUNCTION get_h2h_records(user_auth_id TEXT)
RETURNS TABLE (
  opponent_auth_id TEXT,
  opponent_username TEXT,
  wins INTEGER,
  losses INTEGER
)
LANGUAGE sql STABLE AS $$
SELECT
  opp.auth_id AS opponent_auth_id,
  opp.username AS opponent_username,
  SUM(CASE WHEN m.winner_id = user_auth_id THEN 1 ELSE 0 END) AS wins,
  SUM(CASE WHEN m.loser_id = user_auth_id THEN 1 ELSE 0 END) AS losses
FROM matches m
JOIN users opp
ON (CASE
  WHEN m.winner_id = user_auth_id THEN m.loser_id
  WHEN m.loser_id = user_auth_id THEN m.winner_id
END) = opp.auth_id
WHERE m.winner_id = user_auth_id
OR m.loser_id = user_auth_id
GROUP BY opp.auth_id, opp.username
ORDER BY (SUM(CASE WHEN m.winner_id = user_auth_id THEN 1 ELSE 0 END)
+ SUM(CASE WHEN m.loser_id = user_auth_id THEN 1 ELSE 0 END)) DESC
LIMIT 5;
$$;
