import { supabase } from "../config/supabase.js";

const K_FACTOR = 32;

const expectedScore = (playerElo, opponentElo) => 1 / (1 + 10 ** ((opponentElo - playerElo) / 400));

export const calculateEloSingles = (playerA_elo, playerB_elo, winner_team) => {
  const expectedA = expectedScore(playerA_elo, playerB_elo);
  const expectedB = expectedScore(playerB_elo, playerA_elo);

  const actualA = winner_team === "A" ? 1 : 0;
  const actualB = winner_team === "B" ? 1 : 0;

  const newA = Math.round(playerA_elo + K_FACTOR * (actualA - expectedA));
  const newB = Math.round(playerB_elo + K_FACTOR * (actualB - expectedB));

  return {
    teamA: [{ old: playerA_elo, new: newA }],
    teamB: [{ old: playerB_elo, new: newB }],
  };
};

export const calculateEloDoubles = (teamA_elo_array, teamB_elo_array, winner_team) => {
  if (teamA_elo_array.length !== 2 || teamB_elo_array.length !== 2) {
    throw new Error("Doubles matches require exactly 2 players per team");
  }

  const teamA_avg = (teamA_elo_array[0] + teamA_elo_array[1]) / 2;
  const teamB_avg = (teamB_elo_array[0] + teamB_elo_array[1]) / 2;

  const expectedA = expectedScore(teamA_avg, teamB_avg);
  const expectedB = expectedScore(teamB_avg, teamA_avg);

  const actualA = winner_team === "A" ? 1 : 0;
  const actualB = winner_team === "B" ? 1 : 0;

  const deltaA = Math.round(K_FACTOR * (actualA - expectedA));
  const deltaB = Math.round(K_FACTOR * (actualB - expectedB));

  return {
    teamA: teamA_elo_array.map((elo) => ({ old: elo, new: elo + deltaA })),
    teamB: teamB_elo_array.map((elo) => ({ old: elo, new: elo + deltaB })),
  };
};

export const updatePlayerElo = async (auth_id, old_elo, new_elo, match_id) => {
  const { error: updateError } = await supabase
    .from("users")
    .update({ elo: new_elo })
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
    },
  ]);

  if (historyError) {
    throw new Error(historyError.message);
  }
};

export const resolveMatchElo = async (matchRecord) => {
  const { match_id, match_type, players_team_A, players_team_B, winner_team } = matchRecord;

  const allPlayerIds = [...players_team_A, ...players_team_B];
  if (allPlayerIds.length === 0) {
    return [];
  }

  const { data: usersData, error: usersError } = await supabase
    .from("users")
    .select("auth_id, elo")
    .in("auth_id", allPlayerIds);

  if (usersError) {
    throw new Error(usersError.message);
  }

  const users = usersData || [];

  const eloMap = new Map(users.map((u) => [u.auth_id, u.elo ?? 1000]));
  const getElo = (userId) => eloMap.get(userId) ?? 1000;

  let calculations;

  if (match_type === "singles") {
    const [playerA] = players_team_A;
    const [playerB] = players_team_B;
    calculations = calculateEloSingles(getElo(playerA), getElo(playerB), winner_team);
  } else if (match_type === "doubles") {
    const teamAElos = players_team_A.map((id) => getElo(id));
    const teamBElos = players_team_B.map((id) => getElo(id));
    calculations = calculateEloDoubles(teamAElos, teamBElos, winner_team);
  } else {
    throw new Error("Unsupported match type");
  }

  const eloUpdates = [];

  for (let i = 0; i < players_team_A.length; i += 1) {
    const auth_id = players_team_A[i];
    const { old, new: newElo } = calculations.teamA[i];
    await updatePlayerElo(auth_id, old, newElo, match_id);
    eloUpdates.push({ auth_id, old_elo: old, new_elo: newElo });
  }

  for (let i = 0; i < players_team_B.length; i += 1) {
    const auth_id = players_team_B[i];
    const { old, new: newElo } = calculations.teamB[i];
    await updatePlayerElo(auth_id, old, newElo, match_id);
    eloUpdates.push({ auth_id, old_elo: old, new_elo: newElo });
  }

  return eloUpdates;
};
