import { supabase } from "../config/supabase.js";

// ---------------- GET PROFILE ----------------
export const getProfile = async (auth_id) => {
  const { data, error } = await supabase
    .from("users")
    .select("*")
    .eq("auth_id", auth_id)
    .single();

  if (error) return { error: error.message };

  return data;
};

// ---------------- UPDATE PROFILE ----------------
export const updateProfile = async (auth_id, updates) => {
  const { data, error } = await supabase
    .from("users")
    .update(updates)
    .eq("auth_id", auth_id)
    .select()
    .single();

  if (error) return { error: error.message };

  return data;
};

// ---------------- SEARCH USERS ----------------
export const searchUsers = async (query, gender) => {
  if (!query || query.length < 1) {
    return [];
  }

  let supabaseQuery = supabase
    .from("users")
    .select("user_id, username, gender, elo")
    .ilike("username", `%${query}%`)
    .order("elo", { ascending: false });

  if (gender) {
    supabaseQuery = supabaseQuery.eq("gender", gender);
  }

  const { data, error } = await supabaseQuery;

  if (error) {
    throw new Error(error.message);
  }

  return data;
};
