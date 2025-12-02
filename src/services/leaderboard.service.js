import { supabase } from "../config/supabase.js";

export const getLeaderboardByGender = async (gender) => {
  if (!gender || (gender !== "male" && gender !== "female")) {
    return { error: "Invalid gender" };
  }

  const { data, error } = await supabase
    .from("users")
    .select("user_id, username, elo")
    .eq("gender", gender)
    .order("elo", { ascending: false })
    .limit(100);

  if (error) {
    return { error: error.message };
  }

  return {
    gender,
    leaders: data || [],
  };
};
