import { supabase } from "../config/supabase.js";
import { parseScore } from "./scoreParser.service.js";
import { computeEloDelta as computeEloDeltaV2 } from "./elo/formulas/eloFormulaV2.js";

const K_FACTOR = 32;
const FORMULA_VERSION = "v2";

const expectedScore = (playerElo, opponentElo) => 1 / (1 + 10 ** ((opponentElo - playerElo) / 400));

const legacyEloFormula = ({ ratingA, ratingB, scoreA, kFactor }) => {
  const expectedA = expectedScore(ratingA, ratingB);
  const baseDelta = kFactor * (scoreA - expectedA);
  return { deltaA: baseDelta, deltaB: -baseDelta };
};

const formulaMap = {
  v1: legacyEloFormula,
  v2: computeEloDeltaV2,
};

const getFormula = () => formulaMap[FORMULA_VERSION] || legacyEloFormula;

export const computeEloDelta = (params) => {
  const formula = getFormula();
  return formula(params);
};

export const calculateEloSingles = (playerA_elo, playerB_elo, winner_team, parsedScore = null) => {
  const isDraw = parsedScore?.is_draw;
  const actualA = isDraw ? 0.5 : winner_team === "A" ? 1 : 0;

  const { deltaA, deltaB } = computeEloDelta({
    ratingA: playerA_elo,
    ratingB: playerB_elo,
    scoreA: actualA,
    parsedScore,
    kFactor: K_FACTOR,
    mode: "singles",
  });

  const newA = Math.round(playerA_elo + deltaA);
  const newB = Math.round(playerB_elo + deltaB);

  return {
    teamA: [{ old: playerA_elo, new: newA }],
    teamB: [{ old: playerB_elo, new: newB }],
  };
};

export const calculateEloDrawSingles = (playerA_elo, playerB_elo) => {
  const { deltaA } = computeEloDelta({
    ratingA: playerA_elo,
    ratingB: playerB_elo,
    scoreA: 0.5,
    parsedScore: { is_draw: true },
    kFactor: K_FACTOR,
    mode: "singles",
  });

  return {
    teamA: [{ old: playerA_elo, new: playerA_elo + deltaA }],
    teamB: [{ old: playerB_elo, new: playerB_elo + deltaA }],
  };
};

export const calculateEloDoubles = (teamA_elo_array, teamB_elo_array, winner_team, parsedScore = null) => {
  if (teamA_elo_array.length !== 2 || teamB_elo_array.length !== 2) {
    throw new Error("Doubles matches require exactly 2 players per team");
  }

  const teamA_avg = (teamA_elo_array[0] + teamA_elo_array[1]) / 2;
  const teamB_avg = (teamB_elo_array[0] + teamB_elo_array[1]) / 2;

  const isDraw = parsedScore?.is_draw;
  const actualA = isDraw ? 0.5 : winner_team === "A" ? 1 : 0;

  const { deltaA, deltaB } = computeEloDelta({
    ratingA: teamA_avg,
    ratingB: teamB_avg,
    scoreA: actualA,
    parsedScore,
    kFactor: K_FACTOR,
    mode: "doubles",
  });

  return {
    teamA: teamA_elo_array.map((elo) => ({ old: elo, new: Math.round(elo + deltaA) })),
    teamB: teamB_elo_array.map((elo) => ({ old: elo, new: Math.round(elo + deltaB) })),
  };
};

export const calculateEloDrawDoubles = (teamA_elo_array, teamB_elo_array) => {
  if (teamA_elo_array.length !== 2 || teamB_elo_array.length !== 2) {
    throw new Error("Doubles matches require exactly 2 players per team");
  }

  const { deltaA } = computeEloDelta({
    ratingA: teamA_elo_array.reduce((sum, elo) => sum + elo, 0) / teamA_elo_array.length,
    ratingB: teamB_elo_array.reduce((sum, elo) => sum + elo, 0) / teamB_elo_array.length,
    scoreA: 0.5,
    parsedScore: { is_draw: true },
    kFactor: K_FACTOR,
    mode: "doubles",
  });

  return {
    teamA: teamA_elo_array.map((elo) => ({ old: elo, new: elo + deltaA })),
    teamB: teamB_elo_array.map((elo) => ({ old: elo, new: elo + deltaA })),
  };
};

export const updatePlayerElo = async (
  auth_id,
  old_elo,
  new_elo,
  match_id,
  ratingColumn = "singles_elo",
  discipline = "singles"
) => {
  const { error: updateError } = await supabase
    .from("users")
    .update({ [ratingColumn]: new_elo })
    .eq("auth_id", auth_id);

  if (updateError) {
    throw new Error(updateError.message);
  }

  const { error: historyError } = await supabase.from("elo_history").insert([
    {
      auth_id,
      match_id,
      old_elo,
      new_elo,
      discipline,
    },
  ]);

  if (historyError) {
    throw new Error(historyError.message);
  }
};

export const resolveMatchElo = async (matchRecord) => {
  const { match_id, match_type, players_team_A, players_team_B, winner_team, score } = matchRecord;

  const ratingColumn = match_type === "doubles" ? "doubles_elo" : "singles_elo";
  const discipline = match_type === "doubles" ? "doubles" : "singles";

  const allPlayerIds = [...players_team_A, ...players_team_B];
  if (allPlayerIds.length === 0) {
    return [];
  }

  const { data: usersData, error: usersError } = await supabase
    .from("users")
    .select("auth_id, singles_elo, doubles_elo")
    .in("auth_id", allPlayerIds);

  if (usersError) {
    throw new Error(usersError.message);
  }

  const users = usersData || [];

  const eloMap = new Map(
    users.map((u) => [u.auth_id, u[ratingColumn] ?? 1000])
  );
  const getElo = (userId) => eloMap.get(userId) ?? 1000;

  let parsedScore = null;
  if (score) {
    try {
      parsedScore = parseScore(score);
    } catch (err) {
      // If score cannot be parsed, fall back to winner flag only
    }
  }

  const resolvedWinner = parsedScore?.winner_team ?? winner_team;

  let calculations;

  if (match_type === "singles") {
    const [playerA] = players_team_A;
    const [playerB] = players_team_B;
    calculations = calculateEloSingles(getElo(playerA), getElo(playerB), resolvedWinner, parsedScore);
  } else if (match_type === "doubles") {
    const teamAElos = players_team_A.map((id) => getElo(id));
    const teamBElos = players_team_B.map((id) => getElo(id));
    calculations = calculateEloDoubles(teamAElos, teamBElos, resolvedWinner, parsedScore);
  } else {
    throw new Error("Unsupported match type");
  }

  const eloUpdates = [];

  for (let i = 0; i < players_team_A.length; i += 1) {
    const auth_id = players_team_A[i];
    const { old, new: newElo } = calculations.teamA[i];
    await updatePlayerElo(auth_id, old, newElo, match_id, ratingColumn, discipline);
    eloUpdates.push({ auth_id, old_elo: old, new_elo: newElo });
  }

  for (let i = 0; i < players_team_B.length; i += 1) {
    const auth_id = players_team_B[i];
    const { old, new: newElo } = calculations.teamB[i];
    await updatePlayerElo(auth_id, old, newElo, match_id, ratingColumn, discipline);
    eloUpdates.push({ auth_id, old_elo: old, new_elo: newElo });
  }

  return eloUpdates;
};
