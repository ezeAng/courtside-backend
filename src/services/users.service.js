import { supabase } from "../config/supabase.js";

// ---------------- GET PROFILE ----------------
export const getProfile = async (auth_id) => {
  const { data, error } = await supabase
    .from("users")
    .select(
      "auth_id, username, gender, avatar, region, address, bio, profile_image_url, elo"
    )
    .eq("auth_id", auth_id)
    .single();

  if (error) return { error: error.message };

  return data;
};

// ---------------- UPDATE PROFILE ----------------
export const updateProfile = async (auth_id, updates) => {
  return updateUserService(auth_id, updates);
};

// ---------------- UPDATE USER ----------------
export const updateUserService = async (authId, updates) => {
  const allowedFields = ["username", "gender", "avatar"];

  const filteredUpdates = Object.entries(updates || {}).reduce(
    (acc, [key, value]) => {
      if (allowedFields.includes(key) && value !== undefined) {
        acc[key] = value;
      }
      return acc;
    },
    {}
  );

  if (Object.keys(filteredUpdates).length === 0) {
    return { error: "No valid fields provided for update" };
  }

  if (filteredUpdates.avatar !== undefined) {
    const avatarNumber = Number(filteredUpdates.avatar);

    if (!Number.isInteger(avatarNumber) || avatarNumber < 0 || avatarNumber > 9) {
      return { error: "Avatar must be an integer between 0 and 9" };
    }

    filteredUpdates.avatar = avatarNumber;
  }

  const { data, error } = await supabase
    .from("users")
    .update(filteredUpdates)
    .eq("auth_id", authId)
    .select(
      "auth_id, username, gender, avatar, region, address, bio, profile_image_url, elo"
    )
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
    .select("auth_id, username, gender, elo")
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

// ---------------- LIST OTHER USERS ----------------
export const listOtherUsers = async (auth_id) => {
  const { data, error } = await supabase
    .from("users")
    .select("auth_id, username, gender, elo")
    .neq("auth_id", auth_id)
    .order("elo", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data;
};
