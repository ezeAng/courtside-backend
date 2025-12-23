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

  const ratingColumn = discipline === "doubles" ? "elo_doubles" : "elo";

  let query = client
    .from("users")
    .select(
      "auth_id, username, gender, elo, elo_doubles, profile_image_url"
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
