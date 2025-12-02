import { supabase } from "../config/supabase.js";
import { parseScore } from "./scoreParser.service.js";
import { resolveMatchElo } from "./elo.service.js";

const buildMatchResponse = (match, players, userMap) => {
  const playersWithUser = players.map((p) => ({
    ...p,
    user: userMap.get(p.user_id) || null,
  }));

  const team_A_players = playersWithUser.filter((p) => p.team === "A");
  const team_B_players = playersWithUser.filter((p) => p.team === "B");
  const winnerPlayer = playersWithUser.find((p) => p.is_winner);

  return {
    ...match,
    team_A_players,
    team_B_players,
    winner_team: winnerPlayer ? winnerPlayer.team : null,
  };
};

const fetchPlayersWithUsers = async (matchIds) => {
  const { data: matchPlayersData, error: playersError } = await supabase
    .from("match_players")
    .select("*")
    .in("match_id", matchIds);

  if (playersError) {
    return { error: playersError.message };
  }

  const matchPlayers = matchPlayersData || [];

  const userIds = [...new Set(matchPlayers.map((p) => p.user_id))];

  if (userIds.length === 0) {
    return { matchPlayers, userMap: new Map() };
  }

  const { data: usersData, error: usersError } = await supabase
    .from("users")
    .select("user_id, username, gender, elo")
    .in("user_id", userIds);

  if (usersError) {
    return { error: usersError.message };
  }

  const users = usersData || [];

  const userMap = new Map(users.map((u) => [u.user_id, u]));

  return { matchPlayers, userMap };
};

export const createMatch = async (
  { match_type, players_team_A = [], players_team_B = [], winner_team, score, played_at },
  created_by
) => {
  try {
    const parsedScore = parseScore(score);
    const resolvedWinner = winner_team || parsedScore.winner_team;

    if (winner_team && winner_team !== parsedScore.winner_team) {
      return { error: "Provided winner does not match parsed score" };
    }

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
        is_winner: resolvedWinner === "A",
      });
    });

    players_team_B.forEach((user_id) => {
      playerRows.push({
        match_id: match.match_id,
        user_id,
        team: "B",
        is_winner: resolvedWinner === "B",
      });
    });

    const { error: playersError } = await supabase
      .from("match_players")
      .insert(playerRows);

    if (playersError) return { error: playersError.message };

    let elo_updates = [];

    try {
      elo_updates = await resolveMatchElo({
        match_id: match.match_id,
        match_type,
        players_team_A,
        players_team_B,
        winner_team: resolvedWinner,
      });
    } catch (eloError) {
      return { error: eloError.message };
    }

    const { matchPlayers, userMap, error } = await fetchPlayersWithUsers([
      match.match_id,
    ]);

    if (error) {
      return { error };
    }

    const responseMatch = buildMatchResponse(
      match,
      matchPlayers.filter((p) => p.match_id === match.match_id),
      userMap
    );

    return {
      match_id: match.match_id,
      match_type,
      winner_team: resolvedWinner,
      score,
      match_status: match.match_status,
      players: {
        A: responseMatch.team_A_players,
        B: responseMatch.team_B_players,
      },
      elo_updates,
    };
  } catch (err) {
    return { error: err.message };
  }
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

  const { matchPlayers, userMap, error } = await fetchPlayersWithUsers(matchIds);

  if (error) return { error };

  return matches.map((match) => {
    const players = matchPlayers.filter((p) => p.match_id === match.match_id);
    return buildMatchResponse(match, players, userMap);
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

  const { matchPlayers, userMap, error } = await fetchPlayersWithUsers([match_id]);

  if (error) return { error };

  const players = matchPlayers.filter((p) => p.match_id === match_id);

  return buildMatchResponse(match, players, userMap);
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
