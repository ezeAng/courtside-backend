import { supabase } from "../config/supabase.js";

export const getLeaderboard = async (gender) => {
  const validGenders = ["male", "female", "mixed"];

  if (!gender || !validGenders.includes(gender)) {
    return { error: "Invalid gender" };
  }

  let query = supabase
    .from("users")
    .select("user_id, username, gender, elo")
    .order("elo", { ascending: false })
    .limit(100);

  if (gender !== "mixed") {
    query = query.eq("gender", gender);
  }

  const { data, error } = await query;

  if (error) {
    return { error: error.message };
  }

  return {
    gender,
    leaders: data || [],
  };
};
