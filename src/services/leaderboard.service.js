import { supabase } from "../config/supabase.js";

export const getLeaderboard = async (gender, discipline = "singles", client = supabase) => {
  const validGenders = ["male", "female", "mixed"];
  const validDisciplines = ["singles", "doubles"];

  if (!gender || !validGenders.includes(gender)) {
    return { error: "Invalid gender" };
  }

  if (!discipline || !validDisciplines.includes(discipline)) {
    return { error: "Invalid discipline" };
  }

  const ratingColumn = discipline === "doubles" ? "doubles_elo" : "singles_elo";

  let query = client
    .from("users")
    .select(
      "auth_id, username, gender, singles_elo, doubles_elo, profile_image_url"
    )
    .order(ratingColumn, { ascending: false })
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
    discipline,
    leaders: (data || []).map((leader) => ({
      ...leader,
      rating: leader[ratingColumn],
    })),
  };
};

export const getOverallLeaderboard = async (options = {}, client = supabase) => {
  const limit = Number(options.limit) || 100;
  const offset = Number(options.offset) || 0;

  const { data, error } = await client.rpc("get_overall_leaderboard", {
    p_limit: limit,
    p_offset: offset,
  });

  if (error) {
    return { error: error.message };
  }

  return {
    items: data ?? [],
    limit,
    offset,
  };
};
