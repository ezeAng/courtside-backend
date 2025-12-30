import { supabase } from "../config/supabase.js";
import { computeEloDelta } from "./elo.service.js";
import { parseScore } from "./scoreParser.service.js";

const DEFAULT_ELO = 1000;
const K_SINGLES = 32;
const K_DOUBLES = 32;

const avg = (nums = []) => {
  if (!Array.isArray(nums) || nums.length === 0) {
    return 0;
  }
  return nums.reduce((sum, value) => sum + value, 0) / nums.length;
};
const roundDelta = (value) => Math.round(value);

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
        singles_elo: user.singles_elo ?? null,
        doubles_elo: user.doubles_elo ?? null,
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

const normalizeScoreInput = (scoreInput) => {
  if (!scoreInput) return null;
  if (typeof scoreInput === "string") return scoreInput;

  if (typeof scoreInput === "object" && Array.isArray(scoreInput.sets)) {
    const parts = scoreInput.sets
      .map((set) => {
        if (!Array.isArray(set) || set.length !== 2) return null;
        const [a, b] = set;
        if (!Number.isInteger(a) || !Number.isInteger(b)) return null;
        return `${a}-${b}`;
      })
      .filter(Boolean);

    if (parts.length === scoreInput.sets.length && parts.length > 0) {
      return parts.join(",");
    }
  }

  return null;
};

const determineWinnerTeam = (players) => {
  const winnerPlayer = players.find((p) => p.is_winner);
  return winnerPlayer ? winnerPlayer.team : null;
};

const determineWinnerFromScore = (score) => {
  const parsed = typeof score === "string" ? parseScore(score) : score;

  if (parsed.is_draw) {
    return { winnerSide: null, is_draw: true };
  }

  if (!parsed.winner_team) {
    throw buildError("Winner could not be determined from score", 400);
  }

  return { winnerSide: parsed.winner_team, is_draw: false };
};

const loadMatchWithPlayers = async (matchId, client = supabase) => {
  const { data: match, error: matchError } = await client
    .from("matches")
    .select("*")
    .eq("match_id", matchId)
    .single();

  if (matchError) {
    const status = matchError.code === "PGRST116" ? 404 : 400;
    return { error: matchError.message, status };
  }

  const { data: matchPlayers, error: playersError } = await client
    .from("match_players")
    .select("auth_id, team, is_winner")
    .eq("match_id", matchId);

  if (playersError) {
    return { error: playersError.message, status: 400 };
  }

  return { match, matchPlayers: matchPlayers || [] };
};

const buildMatchResponse = (match, players, userMap) => {
  let outcome = { winner_team: determineWinnerTeam(players), is_draw: false };

  try {
    const parsed = parseScore(match.score || "");
    outcome = { winner_team: parsed.winner_team, is_draw: parsed.is_draw || false };
  } catch (err) {
    // Fall back to stored winner flags if the score cannot be parsed
  }

  return {
    match_id: match.match_id,
    match_type: match.match_type,
    status: match.status,
    score: match.score,
    winner_team: outcome.winner_team ?? determineWinnerTeam(players),
    is_draw: outcome.is_draw,
    played_at: match.played_at,
    video_link: match.video_link || null,
    video_added_at: match.video_added_at || null,
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
    .select("auth_id, username, gender, singles_elo, doubles_elo")
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

const buildOpponentConfirmations = (matchPlayers, submitterId) => {
  const submitter = matchPlayers.find((p) => p.auth_id === submitterId);
  if (!submitter) return [];

  const submitterTeam = submitter.team;
  const opponentTeam = submitterTeam === "A" ? "B" : "A";

  return matchPlayers
    .filter((p) => p.team === opponentTeam)
    .map((p) => p.auth_id)
    .filter(Boolean);
};

export const createMatch = async (
  { match_type, players_team_A = [], players_team_B = [], winner_team, score, played_at },
  submitted_by
) => {
  try {
    
    const normalizedScore = normalizeScoreInput(score);
    
    if (!normalizedScore) {
      return { error: "Invalid score format", status: 400 };
    }
    const parsedScore = parseScore(normalizedScore);

    if (parsedScore.is_draw && winner_team) {
      return { error: "Cannot specify a winner for a drawn scoreline", status: 400 };
    }
    if (winner_team && parsedScore.winner_team && winner_team !== parsedScore.winner_team) {
      return { error: "Provided winner does not match parsed score" };
    }

    const resolvedWinner = winner_team || parsedScore.winner_team || null;

    const playedAtTimestamp = played_at ?? new Date().toISOString();

    const confirmationList = [
      ...new Set(
        buildConfirmationList(match_type, players_team_A, players_team_B, submitted_by).filter(
          Boolean
        )
      ),
    ];
    

    const { data: match, error: matchError } = await supabase
      .from("matches")
      .insert([
        {
          match_type,
          score: normalizedScore,
          played_at: playedAtTimestamp,
          submitted_by,
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
      is_draw: parsedScore.is_draw || false,
      score: normalizedScore,
      status: match.status,
      needs_confirmation_from_list: match.needs_confirmation_from_list,
      players: responseMatch.players,
    };
  } catch (err) {
    return { error: err.message };
  }
};

export const cancelMatch = async (matchId, userId, reason) => {
  const { match, matchPlayers, error, status } = await loadMatchWithPlayers(matchId);
  if (error) return { error, status };

  if (match.status !== "pending") {
    return { error: "Match cannot be cancelled", status: 400 };
  }

  const participantIds = matchPlayers.map((p) => p.auth_id);
  const isParticipant = participantIds.includes(userId) || match.submitted_by === userId;

  if (!isParticipant) {
    return { error: "User not authorized to cancel this match", status: 403 };
  }

  const cancelled_at = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("matches")
    .update({
      status: "cancelled",
      cancelled_by: userId,
      cancel_reason: reason || null,
      cancelled_at,
    })
    .eq("match_id", matchId);

  if (updateError) return { error: updateError.message, status: 400 };

  return {
    success: true,
    status: "cancelled",
    match_id: matchId,
    cancel_reason: reason || null,
  };
};

export const submitMatchScore = async (matchId, userId, score, providedWinner) => {
  const { match, matchPlayers, error, status } = await loadMatchWithPlayers(matchId);
  if (error) return { error, status };

  if (match.status !== "pending") {
    return { error: "Match is not accepting scores", status: 400 };
  }

  if (!matchPlayers.some((p) => p.auth_id === userId)) {
    return { error: "User is not a participant", status: 403 };
  }

  const normalizedScore = normalizeScoreInput(score);
  if (!normalizedScore) {
    return { error: "Invalid score format", status: 400 };
  }

  let parsedScore;

  try {
    parsedScore = parseScore(normalizedScore);
  } catch (err) {
    return { error: err.message, status: 400 };
  }

  if (parsedScore.is_draw && providedWinner) {
    return { error: "Cannot specify a winner for a drawn scoreline", status: 400 };
  }

  if (
    providedWinner &&
    parsedScore.winner_team &&
    providedWinner !== parsedScore.winner_team
  ) {
    return { error: "Provided winner does not match parsed score", status: 400 };
  }

  const winner_team = providedWinner || parsedScore.winner_team || null;
  const confirmationList = buildOpponentConfirmations(matchPlayers, userId);
  const submitted_at = new Date().toISOString();
  const played_at = match.played_at || submitted_at;

  const { error: updateError } = await supabase
    .from("matches")
    .update({
      score: normalizedScore,
      submitted_by: userId,
      submitted_at,
      status: "pending",
      played_at,
      needs_confirmation_from_list: confirmationList,
    })
    .eq("match_id", matchId);

  if (updateError) return { error: updateError.message, status: 400 };

  const winnerUpdates = matchPlayers.map((player) => ({
    match_id: matchId,
    auth_id: player.auth_id,
    team: player.team,
    is_winner: player.team === winner_team,
  }));

  const { error: winnerError } = await supabase
    .from("match_players")
    .upsert(winnerUpdates, { onConflict: "match_id,auth_id" });

  if (winnerError) return { error: winnerError.message, status: 400 };

  return {
    match_id: matchId,
    status: "pending",
    winner_team,
    is_draw: parsedScore.is_draw || false,
    score: normalizedScore,
    needs_confirmation_from_list: confirmationList,
  };
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

export const editPendingMatch = async (
  match_id,
  requesterId,
  { match_type, players_team_A = [], players_team_B = [], winner_team, score, played_at } = {}
) => {
  const { match, error, status } = await loadMatchWithPlayers(match_id);
  if (error) return { error, status };

  if (match.status !== "pending") {
    return { error: "Only pending matches can be edited", status: 400 };
  }

  if (match.submitted_by !== requesterId) {
    return { error: "Not authorized to edit this match", status: 403 };
  }

  if (!["singles", "doubles"].includes(match_type)) {
    return { error: "match_type must be 'singles' or 'doubles'", status: 400 };
  }

  if (!match_type) {
    return { error: "match_type is required", status: 400 };
  }

  const normalizedScore = normalizeScoreInput(score);
  if (!normalizedScore) {
    return { error: "Invalid score format", status: 400 };
  }

  let parsedScore;
  try {
    parsedScore = parseScore(normalizedScore);
  } catch (err) {
    return { error: err.message, status: 400 };
  }

  if (parsedScore.is_draw && winner_team) {
    return { error: "Cannot specify a winner for a drawn scoreline", status: 400 };
  }

  if (winner_team && parsedScore.winner_team && winner_team !== parsedScore.winner_team) {
    return { error: "Provided winner does not match parsed score", status: 400 };
  }

  if (match_type === "singles") {
    if (players_team_A.length !== 1 || players_team_B.length !== 1) {
      return { error: "Singles match requires one player per team", status: 400 };
    }
  } else if (match_type === "doubles") {
    if (players_team_A.length !== 2 || players_team_B.length !== 2) {
      return { error: "Doubles match requires two players per team", status: 400 };
    }
  }

  const allPlayers = [...players_team_A, ...players_team_B];
  const uniquePlayers = new Set(allPlayers.filter(Boolean));
  if (uniquePlayers.size !== allPlayers.length) {
    return { error: "Duplicate players detected across teams", status: 400 };
  }

  if (!uniquePlayers.has(requesterId)) {
    return { error: "Submitter must be one of the players", status: 400 };
  }

  const resolvedWinner = winner_team || parsedScore.winner_team || null;
  const confirmationList = [
    ...new Set(
      buildConfirmationList(match_type, players_team_A, players_team_B, requesterId).filter(
        Boolean
      )
    ),
  ];

  const playedAtValue = played_at || match.played_at || new Date().toISOString();
  const submittedAtValue = new Date().toISOString();

  const { data: updatedMatch, error: updateError } = await supabase
    .from("matches")
    .update({
      match_type,
      score: normalizedScore,
      played_at: playedAtValue,
      status: "pending",
      submitted_by: requesterId,
      submitted_at: submittedAtValue,
      needs_confirmation_from_list: confirmationList,
    })
    .eq("match_id", match_id)
    .select("*")
    .single();

  if (updateError) {
    return { error: updateError.message, status: 400 };
  }

  const { error: deleteError } = await supabase.from("match_players").delete().eq("match_id", match_id);
  if (deleteError) {
    return { error: deleteError.message, status: 400 };
  }

  const playerRows = [];

  players_team_A.forEach((auth_id) => {
    playerRows.push({
      match_id,
      auth_id,
      team: "A",
      is_winner: resolvedWinner === "A",
    });
  });

  players_team_B.forEach((auth_id) => {
    playerRows.push({
      match_id,
      auth_id,
      team: "B",
      is_winner: resolvedWinner === "B",
    });
  });

  const { error: insertError } = await supabase.from("match_players").insert(playerRows);
  if (insertError) {
    return { error: insertError.message, status: 400 };
  }

  const { matchPlayers, userMap, error: fetchError } = await fetchPlayersWithUsers([match_id]);
  if (fetchError) return { error: fetchError };

  const players = matchPlayers.filter((p) => p.match_id === match_id);
  const response = buildMatchResponse(updatedMatch, players, userMap);

  return {
    ...response,
    needs_confirmation_from_list: confirmationList,
  };
};

export const deleteMatch = async (match_id, requesterId) => {
  const { match, error, status } = await loadMatchWithPlayers(match_id);
  if (error) return { error, status };

  if (match.status !== "pending") {
    return { error: "Only pending matches can be deleted", status: 400 };
  }

  if (match.submitted_by !== requesterId) {
    return { error: "Not authorized to delete this match", status: 403 };
  }

  const { error: deleteError } = await supabase.from("matches").delete().eq("match_id", match_id);

  if (deleteError) return { error: deleteError.message, status: 400 };

  return { message: "Match deleted successfully" };
};

export const getPendingMatches = async (userId) => {
  const baseSelect = `
    *,
    submitted_by_user:users!submitted_by (
      auth_id,
      username
    ),
    match_players (
      match_id,
      auth_id,
      user:users (
        auth_id,
        username
      )
    )
  `;

  // Incoming: user needs to confirm
  const { data: incoming, error: err1 } = await supabase
    .from("matches")
    .select(baseSelect)
    .eq("status", "pending")
    .contains("needs_confirmation_from_list", JSON.stringify([userId]))
    .order("created_at", { ascending: false });

  if (err1) throw buildError(err1.message, 400);

  // Outgoing: user submitted
  const { data: outgoing, error: err2 } = await supabase
    .from("matches")
    .select(baseSelect)
    .eq("status", "pending")
    .eq("submitted_by", userId)
    .order("created_at", { ascending: false });

  if (err2) throw buildError(err2.message, 400);

  return { incoming, outgoing };
};




const getRankForElo = async (client, eloValue, column = "singles_elo") => {
  const { count, error } = await client
    .from("users")
    .select("auth_id", { count: "exact", head: true })
    .gt(column, eloValue ?? 0);

  if (error) throw buildError(error.message, 400);

  return (count ?? 0) + 1;
};

const buildUpsetDetails = (winner_team, matchPlayers, eloMap) => {
  if (!winner_team) return { is_upset: false };

  const winnerIds = matchPlayers.filter((p) => p.team === winner_team).map((p) => p.auth_id);
  const opponentIds = matchPlayers.filter((p) => p.team !== winner_team).map((p) => p.auth_id);

  const average = (ids) => {
    if (ids.length === 0) return null;
    const total = ids.reduce((sum, id) => sum + (eloMap.get(id) ?? DEFAULT_ELO), 0);
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
  if (match.status === "confirmed") throw buildError("Match already confirmed", 409);
  if (match.status !== "pending") throw buildError("Match already processed", 400);
  
  if (
    Array.isArray(match.needs_confirmation_from_list) &&
    !match.needs_confirmation_from_list.includes(userId)
  ) {
    throw buildError("User not authorized to confirm this match", 403);
  }

  const { data: matchPlayers, error: playersError } = await client
    .from("match_players")
    .select("auth_id, team, is_winner")
    .eq("match_id", matchId);

  if (playersError) throw buildError(playersError.message, 400);
  if (!matchPlayers || matchPlayers.length === 0)
    throw buildError("Match players not found", 404);

  const playerIds = matchPlayers.map((p) => p.auth_id);
  if (!playerIds.includes(userId)) {
    throw buildError("User not authorized to confirm this match", 403);
  }

  const submitter = matchPlayers.find((p) => p.auth_id === match.submitted_by);
  if (!submitter) throw buildError("Submitting player not found for this match", 400);

  const confirmer = matchPlayers.find((p) => p.auth_id === userId);
  if (confirmer?.team === submitter.team) {
    throw buildError("Confirmation must come from the opposing team", 403);
  }

  const discipline = match.match_type || "singles";
  if (!match.match_type) {
    throw buildError("No match type found", 400);
  }

  const teamA = matchPlayers.filter((p) => p.team === "A").map((p) => p.auth_id);
  const teamB = matchPlayers.filter((p) => p.team === "B").map((p) => p.auth_id);

  if (discipline === "doubles") {
    if (teamA.length !== 2 || teamB.length !== 2) {
      throw buildError("Doubles match requires two players per team", 400);
    }
  } else {
    if (teamA.length !== 1 || teamB.length !== 1) {
      throw buildError("Singles match requires one player per team", 400);
    }
  }

  const participants = [...teamA, ...teamB];
  const participantsSet = new Set(participants);
  if (participantsSet.size !== participants.length) {
    throw buildError("Duplicate players detected across teams", 400);
  }

  const matchParticipantSet = new Set(playerIds);
  for (const participant of participantsSet) {
    if (!matchParticipantSet.has(participant)) {
      throw buildError("Player is not registered for this match", 400);
    }
  }

  let parsedScore;
  try {
    parsedScore = parseScore(match.score);
  } catch (err) {
    throw buildError(err.message, 400);
  }

  const { winnerSide, is_draw } = determineWinnerFromScore(parsedScore);

  // Load current elos (username fetched here is optional; RPC also returns username now)
  const { data: players, error: usersError } = await client
    .from("users")
    .select("auth_id, singles_elo, doubles_elo, username")
    .in("auth_id", participants);

  if (usersError) throw buildError(usersError.message, 400);

  const users = players || [];
  const usersMap = new Map(users.map((p) => [p.auth_id, p]));

  if (!participants.every((id) => usersMap.has(id))) {
    throw buildError("User not found for one or more participants", 400);
  }

  const ratingColumn = discipline === "doubles" ? "doubles_elo" : "singles_elo";
  const eloMap = new Map(
    participants.map((id) => [id, usersMap.get(id)?.[ratingColumn] ?? DEFAULT_ELO])
  );

  const preMatchRanks = new Map();
  for (const playerId of participants) {
    const rank = await getRankForElo(client, eloMap.get(playerId), ratingColumn);
    preMatchRanks.set(playerId, rank);
  }

  const scoreA = is_draw ? 0.5 : winnerSide === "A" ? 1 : 0;

  const teamARating =
    discipline === "doubles"
      ? avg(teamA.map((id) => eloMap.get(id) ?? DEFAULT_ELO))
      : eloMap.get(teamA[0]) ?? DEFAULT_ELO;

  const teamBRating =
    discipline === "doubles"
      ? avg(teamB.map((id) => eloMap.get(id) ?? DEFAULT_ELO))
      : eloMap.get(teamB[0]) ?? DEFAULT_ELO;

  const kFactor = discipline === "doubles" ? K_DOUBLES : K_SINGLES;
  const { deltaA: rawDeltaA, deltaB: rawDeltaB } = computeEloDelta({
    ratingA: teamARating,
    ratingB: teamBRating,
    scoreA,
    parsedScore,
    kFactor,
    mode: discipline,
  });
  const deltaA = roundDelta(rawDeltaA);
  const deltaB = roundDelta(rawDeltaB);

  const teamAUpdatesRaw = teamA.map((auth_id) => {
    const old_elo = eloMap.get(auth_id) ?? DEFAULT_ELO;
    return { auth_id, old_elo, new_elo: old_elo + deltaA };
  });

  const teamBUpdatesRaw = teamB.map((auth_id) => {
    const old_elo = eloMap.get(auth_id) ?? DEFAULT_ELO;
    return { auth_id, old_elo, new_elo: old_elo + deltaB };
  });

  const updates = [...teamAUpdatesRaw, ...teamBUpdatesRaw];

  const confirmedAt = new Date().toISOString();
  const playedAt = match.played_at ?? confirmedAt;
  
  const { data: txResult, error: txError } = await client.rpc("confirm_match_tx", {
    p_match_id: matchId,
    p_discipline: discipline,
    p_updates: updates,
    p_played_at: playedAt,
    p_confirmed_at: confirmedAt,
    p_elo_change_side_a: deltaA,
    p_elo_change_side_b: deltaB,
  });

  if (txError) throw buildError(txError.message, 400);

  const enrichedMap = new Map(
    (txResult?.players || []).map((u) => [u.auth_id, u])
  );

  // Fallback username from users query if RPC didn't return for some reason
  const fallbackUsername = (auth_id) => usersMap.get(auth_id)?.username;

  const enrich = (update) => ({
    ...update,
    username: enrichedMap.get(update.auth_id)?.username ?? fallbackUsername(update.auth_id),
  });

  const teamAUpdates = teamAUpdatesRaw.map(enrich);
  const teamBUpdates = teamBUpdatesRaw.map(enrich);
  const enrichedUpdates = [...teamAUpdates, ...teamBUpdates];

  const rankChanges = [];
  for (const update of enrichedUpdates) {
    const newRank = await getRankForElo(client, update.new_elo, ratingColumn);
    const previousRank = preMatchRanks.get(update.auth_id) ?? null;

    rankChanges.push({
      playerId: update.auth_id,
      username: update.username, // helpful for UI
      previousRank,
      newRank,
      rankChange:
        previousRank != null && newRank != null ? previousRank - newRank : null,
    });
  }

  const upsetDetails = buildUpsetDetails(
    parsedScore.winner_team ?? determineWinnerTeam(matchPlayers),
    matchPlayers,
    eloMap
  );

  return {
    success: true,
    matchId,
    status: "confirmed",
    confirmed_at: confirmedAt,
    discipline,
    elo_change_side_a: deltaA,
    elo_change_side_b: deltaB,
    updated_elos: {
      sideA: teamAUpdates,
      sideB: teamBUpdates,
      teamA_delta: deltaA,
      teamB_delta: deltaB,
    },
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

export const updateMatchVideoLink = async (matchId, authId, videoLink) => {
  if (!videoLink || !videoLink.startsWith("https://")) {
    return { error: "Invalid video link", status: 400 };
  }

  const { data: match, error: matchError } = await supabase
    .from("matches")
    .select("*")
    .eq("match_id", matchId)
    .single();

  if (matchError) {
    const status = matchError.code === "PGRST116" ? 404 : 400;
    const errorMessage = matchError.code === "PGRST116" ? "Match not found" : matchError.message;
    return { error: errorMessage, status };
  }

  if (match.status !== "confirmed") {
    return { error: "Match not confirmed", status: 400 };
  }

  const { data: participants, error: participantsError } = await supabase
    .from("match_players")
    .select("auth_id")
    .eq("match_id", matchId);

  if (participantsError) {
    return { error: participantsError.message, status: 400 };
  }

  const participantIds = (participants || []).map((p) => p.auth_id);

  if (!participantIds.includes(authId)) {
    return { error: "Not authorized for this match", status: 403 };
  }

  const video_added_at = new Date().toISOString();

  const { data: updatedMatch, error: updateError } = await supabase
    .from("matches")
    .update({ video_link: videoLink, video_added_at })
    .eq("match_id", matchId)
    .select("match_id, video_link, video_added_at")
    .single();

  if (updateError) {
    return { error: updateError.message, status: 400 };
  }

  return {
    match_id: updatedMatch.match_id,
    video_link: updatedMatch.video_link,
    video_added_at: updatedMatch.video_added_at,
  };
};
