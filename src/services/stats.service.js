import { supabase } from "../config/supabase.js";

const allowedRanges = ["1D", "1W", "1M", "YTD", "ALL"];

export const getEloSeries = async (authId, range = "1M") => {

  if (!allowedRanges.includes(range)) {
    return { error: "Invalid range" };
  }

  const { data, error } = await supabase.rpc("get_elo_series", {
    p_auth_id: authId,
    p_range: range,
    p_tz: "Asia/Singapore",
  });

  if (error) {
    console.log(error)
    return { error: error.message };
  }

  return data;
};

export const ranges = allowedRanges;
