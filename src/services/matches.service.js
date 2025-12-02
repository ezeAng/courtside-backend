import { supabase } from "../config/supabase.js";

const buildMatchResponse = (match, players) => {
  const team_A_players = players.filter((p) => p.team === "A");
  const team_B_players = players.filter((p) => p.team === "B");
  const winnerPlayer = players.find((p) => p.is_winner);

  return {
    ...match,
    team_A_players,
    team_B_players,
    winner_team: winnerPlayer ? winnerPlayer.team : null,
  };
};

export const createMatch = async (
  { match_type, players_team_A = [], players_team_B = [], winner_team, score, played_at },
  created_by
) => {
  const { data: match, error: matchError } = await supabase
    .from("matches")
    .insert([
      {
        match_type,
        score,
        played_at,
        created_by,
      },
    ])
    .select()
    .single();

  if (matchError) return { error: matchError.message };

  const playerRows = [];

  players_team_A.forEach((user_id) => {
    playerRows.push({
      match_id: match.match_id,
      user_id,
      team: "A",
      is_winner: winner_team === "A",
    });
  });

  players_team_B.forEach((user_id) => {
    playerRows.push({
      match_id: match.match_id,
      user_id,
      team: "B",
      is_winner: winner_team === "B",
    });
  });

  const { error: playersError } = await supabase
    .from("match_players")
    .insert(playerRows);

  if (playersError) return { error: playersError.message };

  return {
    message: "Match created successfully",
    match_id: match.match_id,
  };
};

export const listMatchesForUser = async (user_id) => {
  const { data: playerMatches, error: lookupError } = await supabase
    .from("match_players")
    .select("match_id")
    .eq("user_id", user_id);

  if (lookupError) return { error: lookupError.message };

  if (!playerMatches || playerMatches.length === 0) return [];

  const matchIds = [...new Set(playerMatches.map((entry) => entry.match_id))];

  const { data: matches, error: matchesError } = await supabase
    .from("matches")
    .select("*")
    .in("match_id", matchIds);

  if (matchesError) return { error: matchesError.message };

  const { data: matchPlayers, error: playersError } = await supabase
    .from("match_players")
    .select("*")
    .in("match_id", matchIds);

  if (playersError) return { error: playersError.message };

  return matches.map((match) => {
    const players = matchPlayers.filter((p) => p.match_id === match.match_id);
    return buildMatchResponse(match, players);
  });
};

export const getMatchById = async (match_id) => {
  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("*")
    .eq("match_id", match_id)
    .single();

  if (matchError) {
    const status = matchError.code === "PGRST116" ? 404 : 400;
    return { error: matchError.message, status };
  }

  const { data: players, error: playersError } = await supabase
    .from("match_players")
    .select("*")
    .eq("match_id", match_id);

  if (playersError) return { error: playersError.message };

  return buildMatchResponse(match, players);
};

export const deleteMatch = async (match_id, requesterId) => {
  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("*")
    .eq("match_id", match_id)
    .single();

  if (matchError) {
    const status = matchError.code === "PGRST116" ? 404 : 400;
    return { error: matchError.message, status };
  }

  if (match.created_by !== requesterId) {
    return { error: "Not authorized to delete this match", status: 403 };
  }

  const { error: deleteError } = await supabase
    .from("matches")
    .delete()
    .eq("match_id", match_id);

  if (deleteError) return { error: deleteError.message };

  return { message: "Match deleted successfully" };
};
