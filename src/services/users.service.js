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
