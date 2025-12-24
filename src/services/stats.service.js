import { supabase } from "../config/supabase.js";

const allowedRanges = ["1W", "1M", "3M", "6M", "1Y"];
const allowedEloTypes = ["overall", "singles", "doubles"];

export const getEloSeries = async (
  authId,
  range = "1M",
  eloType = "overall",
  tz = "UTC"
) => {
  if (!allowedRanges.includes(range)) {
    return { error: "Invalid range" };
  }

  if (!allowedEloTypes.includes(eloType)) {
    return { error: "Invalid elo type" };
  }

  const { data, error } = await supabase.rpc("get_elo_series", {
    p_auth_id: authId,
    p_range: range,
    p_tz: tz,
    p_elo_type: eloType,
  });

  if (error) {
    console.log(error)
    return { error: error.message };
  }

  return data;
};

export const getMyOverallRankService = async (authId, client = supabase) => {
  if (!authId) {
    return { error: "Missing auth ID" };
  }

  const { data, error } = await client.rpc("get_my_overall_rank", {
    p_auth_id: authId,
  });

  if (error) {
    return { error: error.message };
  }

  return data ?? null;
};

export const ranges = allowedRanges;
export const eloTypes = allowedEloTypes;
