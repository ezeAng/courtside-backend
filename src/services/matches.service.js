import { supabase } from "../config/supabase.js";
import { parseScore } from "./scoreParser.service.js";
import { calculateEloDoubles, calculateEloSingles } from "./elo.service.js";

const buildError = (message, status = 400) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

const buildPlayers = (players, userMap) => {
  return players.reduce(
    (acc, player) => {
      const user = userMap.get(player.auth_id) || {};

      const formattedPlayer = {
        auth_id: player.auth_id,
        username: user.username || null,
        gender: user.gender || null,
        elo: user.elo ?? null,
      };

      if (player.team === "A") {
        acc.team_A.push(formattedPlayer);
      } else if (player.team === "B") {
        acc.team_B.push(formattedPlayer);
      }

      return acc;
    },
    { team_A: [], team_B: [] }
  );
};

const determineWinnerTeam = (players) => {
  const winnerPlayer = players.find((p) => p.is_winner);
  return winnerPlayer ? winnerPlayer.team : null;
};

const buildMatchResponse = (match, players, userMap) => {
  return {
    match_id: match.match_id,
    match_type: match.match_type,
    score: match.score,
    winner_team: determineWinnerTeam(players),
    played_at: match.played_at,
    players: buildPlayers(players, userMap),
  };
};

const fetchPlayersWithUsers = async (matchIds) => {
  const { data: matchPlayersData, error: playersError } = await supabase
    .from("match_players")
    .select("match_id, auth_id, team, is_winner")
    .in("match_id", matchIds);

  if (playersError) {
    return { error: playersError.message };
  }

  const matchPlayers = matchPlayersData || [];

  const authIds = [...new Set(matchPlayers.map((p) => p.auth_id))];

  if (authIds.length === 0) {
    return { matchPlayers, userMap: new Map() };
  }

  const { data: usersData, error: usersError } = await supabase
    .from("users")
    .select("auth_id, username, gender, elo")
    .in("auth_id", authIds);

  if (usersError) {
    return { error: usersError.message };
  }

  const users = usersData || [];

  const userMap = new Map(users.map((u) => [u.auth_id, u]));

  return { matchPlayers, userMap };
};

const buildConfirmationList = (
  match_type,
  players_team_A = [],
  players_team_B = [],
  submitterId
) => {
  const teamASet = new Set(players_team_A.filter(Boolean));
  const teamBSet = new Set(players_team_B.filter(Boolean));

  if (match_type === "singles") {
    if (teamASet.has(submitterId)) {
      return [...teamBSet];
    }
    if (teamBSet.has(submitterId)) {
      return [...teamASet];
    }
    return [...teamASet, ...teamBSet].filter((id) => id !== submitterId);
  }

  if (match_type === "doubles") {
    if (teamASet.has(submitterId)) {
      return [...teamBSet].filter((id) => id !== submitterId);
    }
    if (teamBSet.has(submitterId)) {
      return [...teamASet].filter((id) => id !== submitterId);
    }
  }

  return [...teamASet, ...teamBSet].filter((id) => id !== submitterId);
};

export const createMatch = async (
  { match_type, players_team_A = [], players_team_B = [], winner_team, score, played_at },
  created_by
) => {
  try {
    const parsedScore = parseScore(score);
    const resolvedWinner = winner_team || parsedScore.winner_team;

    const playedAtTimestamp = played_at ?? new Date().toISOString();

    if (winner_team && winner_team !== parsedScore.winner_team) {
      return { error: "Provided winner does not match parsed score" };
    }

    const confirmationList = [
      ...new Set(
        buildConfirmationList(match_type, players_team_A, players_team_B, created_by).filter(
          Boolean
        )
      ),
    ];

    const { data: match, error: matchError } = await supabase
      .from("matches")
      .insert([
        {
          match_type,
          score,
          played_at: playedAtTimestamp,
          created_by,
          submitted_by: created_by,
          status: "pending",
          needs_confirmation_from_list: confirmationList,
        },
      ])
      .select()
      .single();

    if (matchError) return { error: matchError.message };

    const playerRows = [];

    players_team_A.forEach((auth_id) => {
      playerRows.push({
        match_id: match.match_id,
        auth_id,
        team: "A",
        is_winner: resolvedWinner === "A",
      });
    });

    players_team_B.forEach((auth_id) => {
      playerRows.push({
        match_id: match.match_id,
        auth_id,
        team: "B",
        is_winner: resolvedWinner === "B",
      });
    });

    const { error: playersError } = await supabase
      .from("match_players")
      .insert(playerRows);

    if (playersError) return { error: playersError.message };

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
      status: match.status,
      needs_confirmation_from_list: match.needs_confirmation_from_list,
      players: responseMatch.players,
    };
  } catch (err) {
    return { error: err.message };
  }
};

export const getMatchesForUser = async (auth_id) => {
  const { data: playerMatches, error: lookupError } = await supabase
    .from("match_players")
    .select("match_id")
    .eq("auth_id", auth_id);

  if (lookupError) return { error: lookupError.message };

  if (!playerMatches || playerMatches.length === 0)
    return { auth_id, matches: [] };

  const matchIds = [...new Set(playerMatches.map((entry) => entry.match_id))];

  const { data: matches, error: matchesError } = await supabase
    .from("matches")
    .select("*")
    .in("match_id", matchIds)
    .order("played_at", { ascending: false });

  if (matchesError) return { error: matchesError.message };

  const { matchPlayers, userMap, error } = await fetchPlayersWithUsers(matchIds);

  if (error) return { error };

  const formattedMatches = matches.map((match) => {
    const players = matchPlayers.filter((p) => p.match_id === match.match_id);
    return buildMatchResponse(match, players, userMap);
  });

  return { auth_id, matches: formattedMatches };
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

export const getPendingMatches = async (userId) => {

  const { data: incoming, error: err1 } = await supabase
    .from("matches")
    .select("*")
    .eq("status", "pending")
    .contains("needs_confirmation_from_list", JSON.stringify([userId]))
    .order("created_at", { ascending: false });

  if (err1) throw buildError(err1.message, 400);

  const { data: outgoing, error: err2 } = await supabase
    .from("matches")
    .select("*")
    .eq("status", "pending")
    .eq("submitted_by", userId)
    .order("created_at", { ascending: false });

  if (err2) {
    console.log(err2)
    throw buildError(err2.message, 400);
  }
  
  return { incoming, outgoing };
};

const buildEloUpdates = (match, matchPlayers, players) => {
  const playersTeamA = matchPlayers.filter((p) => p.team === "A").map((p) => p.auth_id);
  const playersTeamB = matchPlayers.filter((p) => p.team === "B").map((p) => p.auth_id);
  const winner_team = determineWinnerTeam(matchPlayers);

  if (!winner_team) {
    throw buildError("Winner not determined for this match", 400);
  }

  const eloMap = new Map(players.map((p) => [p.auth_id, p.elo ?? 1000]));
  const getElo = (userId) => eloMap.get(userId) ?? 1000;

  let updates = [];
  let teamA_delta = null;
  let teamB_delta = null;

  if (match.match_type === "singles") {
    const [playerA] = playersTeamA;
    const [playerB] = playersTeamB;

    if (!playerA || !playerB) {
      throw buildError("Singles match requires two players", 400);
    }

    const calculations = calculateEloSingles(getElo(playerA), getElo(playerB), winner_team);

    teamA_delta = calculations.teamA[0].new - calculations.teamA[0].old;
    teamB_delta = calculations.teamB[0].new - calculations.teamB[0].old;

    updates = [
      {
        playerId: playerA,
        oldElo: calculations.teamA[0].old,
        newElo: calculations.teamA[0].new,
      },
      {
        playerId: playerB,
        oldElo: calculations.teamB[0].old,
        newElo: calculations.teamB[0].new,
      },
    ];
  } else if (match.match_type === "doubles") {
    if (playersTeamA.length !== 2 || playersTeamB.length !== 2) {
      throw buildError("Doubles match requires two players per team", 400);
    }

    const calculations = calculateEloDoubles(
      playersTeamA.map((id) => getElo(id)),
      playersTeamB.map((id) => getElo(id)),
      winner_team
    );

    teamA_delta = calculations.teamA[0].new - calculations.teamA[0].old;
    teamB_delta = calculations.teamB[0].new - calculations.teamB[0].old;

    updates = [
      ...playersTeamA.map((playerId, idx) => ({
        playerId,
        oldElo: calculations.teamA[idx].old,
        newElo: calculations.teamA[idx].new,
      })),
      ...playersTeamB.map((playerId, idx) => ({
        playerId,
        oldElo: calculations.teamB[idx].old,
        newElo: calculations.teamB[idx].new,
      })),
    ];
  } else {
    throw buildError("Unsupported match type", 400);
  }

  return { updates, teamA_delta, teamB_delta };
};

const getRankForElo = async (client, eloValue) => {
  const { count, error } = await client
    .from("users")
    .select("auth_id", { count: "exact", head: true })
    .gt("elo", eloValue ?? 0);

  if (error) throw buildError(error.message, 400);

  return (count ?? 0) + 1;
};

const buildUpsetDetails = (winner_team, matchPlayers, eloMap) => {
  if (!winner_team) return { is_upset: false };

  const winnerIds = matchPlayers.filter((p) => p.team === winner_team).map((p) => p.auth_id);
  const opponentIds = matchPlayers.filter((p) => p.team !== winner_team).map((p) => p.auth_id);

  const average = (ids) => {
    if (ids.length === 0) return null;
    const total = ids.reduce((sum, id) => sum + (eloMap.get(id) ?? 1000), 0);
    return total / ids.length;
  };

  const winner_avg_elo = average(winnerIds);
  const opponent_avg_elo = average(opponentIds);

  if (winner_avg_elo === null || opponent_avg_elo === null) {
    return { is_upset: false, winner_avg_elo, opponent_avg_elo };
  }

  const elo_gap = opponent_avg_elo - winner_avg_elo;

  return {
    is_upset: elo_gap > 0,
    winner_avg_elo,
    opponent_avg_elo,
    elo_gap,
  };
};

export const confirmMatch = async (matchId, userId, client = supabase) => {
  const { data: match, error: loadErr } = await client
    .from("matches")
    .select("*")
    .eq("match_id", matchId)
    .single();

  if (loadErr || !match) throw buildError("Match not found", 404);
  if (match.status !== "pending") throw buildError("Match already processed", 400);
  if (
    !Array.isArray(match.needs_confirmation_from_list) ||
    !match.needs_confirmation_from_list.includes(userId)
  ) {
    throw buildError("User not authorized to confirm this match", 403);
  }

  const { data: matchPlayers, error: playersError } = await client
    .from("match_players")
    .select("auth_id, team, is_winner")
    .eq("match_id", matchId);

  if (playersError) throw buildError(playersError.message, 400);
  if (!matchPlayers || matchPlayers.length === 0) throw buildError("Match players not found", 404);

  const playerIds = matchPlayers.map((p) => p.auth_id);

  const { data: players, error: usersError } = await client
    .from("users")
    .select("auth_id, elo")
    .in("auth_id", playerIds);

  if (usersError) throw buildError(usersError.message, 400);

  const preMatchRanks = new Map();
  const eloMap = new Map((players || []).map((p) => [p.auth_id, p.elo ?? 1000]));

  for (const playerId of playerIds) {
    const rank = await getRankForElo(client, eloMap.get(playerId));
    preMatchRanks.set(playerId, rank);
  }

  const updateResult = buildEloUpdates(match, matchPlayers, players || []);

  for (const update of updateResult.updates) {
    const { error: updateErr } = await client
      .from("users")
      .update({ elo: update.newElo })
      .eq("auth_id", update.playerId);

    if (updateErr) throw buildError(updateErr.message, 400);
  }

  const confirmedAt = new Date().toISOString();
  const playedAt = match.played_at ?? confirmedAt;

  const eloHistoryRows = updateResult.updates.map((update) => ({
    auth_id: update.playerId,
    match_id: matchId,
    old_elo: update.oldElo,
    new_elo: update.newElo,
    created_at: playedAt,
  }));

  if (eloHistoryRows.length > 0) {
    const { error: historyErr } = await client
      .from("elo_history")
      .upsert(eloHistoryRows, { onConflict: "auth_id,match_id" });

    if (historyErr) throw buildError(historyErr.message, 400);
  }

  const { error: updateMatchErr } = await client
    .from("matches")
    .update({
      status: "confirmed",
      confirmed_at: confirmedAt,
      elo_change_side_a: updateResult.teamA_delta ?? null,
      elo_change_side_b: updateResult.teamB_delta ?? null,
    })
    .eq("match_id", matchId);

  if (updateMatchErr) throw buildError(updateMatchErr.message, 400);

  const rankChanges = [];

  for (const update of updateResult.updates) {
    const newRank = await getRankForElo(client, update.newElo);
    const previousRank = preMatchRanks.get(update.playerId) ?? null;

    rankChanges.push({
      playerId: update.playerId,
      previousRank,
      newRank,
      rankChange: previousRank && newRank ? previousRank - newRank : null,
    });
  }

  const upsetDetails = buildUpsetDetails(
    determineWinnerTeam(matchPlayers),
    matchPlayers,
    eloMap
  );

  return {
    success: true,
    matchId,
    status: "confirmed",
    confirmed_at: confirmedAt,
    updated_elos: updateResult,
    ranks: rankChanges,
    upset: upsetDetails,
  };
};

export const rejectMatch = async (matchId, userId) => {
  const { data: match, error: loadErr } = await supabase
    .from("matches")
    .select("*")
    .eq("match_id", matchId)
    .single();

  if (loadErr || !match) throw buildError("Match not found", 404);
  if (match.status !== "pending") throw buildError("Match already processed", 400);
  if (
    !Array.isArray(match.needs_confirmation_from_list) ||
    !match.needs_confirmation_from_list.includes(userId)
  ) {
    throw buildError("User not authorized to reject this match", 403);
  }

  const { error: deleteErr } = await supabase
    .from("matches")
    .delete()
    .eq("match_id", matchId);

  if (deleteErr) throw buildError(deleteErr.message, 400);

  return {
    success: true,
    matchId,
    status: "rejected",
  };
};
