import { supabase } from "../config/supabase.js";

const DEFAULT_ELO = 1000;
const SEARCH_RANGES = [100, 200, 400];

const sortByEloCloseness = (targetElo, players = []) => {
  return players
    .map((player) => ({
      ...player,
      elo: player.elo ?? DEFAULT_ELO,
      elo_gap: Math.abs((player.elo ?? DEFAULT_ELO) - targetElo),
    }))
    .sort((a, b) => {
      if (a.elo_gap === b.elo_gap) return (b.elo ?? DEFAULT_ELO) - (a.elo ?? DEFAULT_ELO);
      return a.elo_gap - b.elo_gap;
    });
};

export const findMatch = async (userId, mode) => {
  if (!mode) return { error: "Mode is required", status: 400 };

  // Fetch the requesting user's ELO to target similar opponents
  const { data: userProfile, error: userError } = await supabase
    .from("users")
    .select("auth_id, username, elo")
    .eq("auth_id", userId)
    .single();

  if (userError) return { error: userError.message, status: 400 };

  const userElo = userProfile?.elo ?? DEFAULT_ELO;

  // progressively widen the search window until we find candidates
  for (const range of [...SEARCH_RANGES, null]) {
    const minElo = range === null ? null : userElo - range;
    const maxElo = range === null ? null : userElo + range;

    let query = supabase
      .from("users")
      .select("auth_id, username, gender, elo, profile_image_url")
      .neq("auth_id", userId)
      .limit(50);

    if (minElo !== null) query = query.gte("elo", minElo);
    if (maxElo !== null) query = query.lte("elo", maxElo);

    const { data: candidates, error: candidateError } = await query;

    if (candidateError) return { error: candidateError.message, status: 400 };

    if (candidates && candidates.length > 0) {
      const recommendations = sortByEloCloseness(userElo, candidates).slice(0, 5);

      return {
        state: "suggested",
        recommendations,
        criteria: {
          target_elo: userElo,
          range: range === null ? "any" : range,
        },
      };
    }
  }

  return {
    state: "no_suggestions",
    message: "No other players available to recommend at this time.",
  };
};

export const leaveQueue = async (userId, mode) => {
  if (!mode) return { error: "Mode is required", status: 400 };

  const { error } = await supabase
    .from("matchmaking_queue")
    .delete()
    .eq("auth_id", userId)
    .eq("mode", mode);

  if (error) return { error: error.message, status: 400 };

  return { success: true, state: "left" };
};
