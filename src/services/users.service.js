import { supabase } from "../config/supabase.js";

const buildTierInfo = (elo = 0) => {
  let tier = "Bronze";

  if (elo >= 900 && elo < 1100) tier = "Silver";
  if (elo >= 1100 && elo < 1300) tier = "Gold";
  if (elo >= 1300 && elo < 1500) tier = "Platinum";
  if (elo >= 1500) tier = "Diamond";

  const star_rating = Math.max(1, Math.min(5, Math.round(elo / 300)));

  return { tier, star_rating };
};

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

// ---------------- AUTOCOMPLETE USERNAMES ----------------
export const searchUsernames = async (query, options = {}) => {
  const trimmedQuery = query?.trim();
  const limit = Math.min(Math.max(Number(options.limit) || 8, 1), 25);
  const excludeAuthId = options.excludeAuthId;

  if (!trimmedQuery) {
    return { results: [], hasMore: false };
  }

  let supabaseQuery = supabase
    .from("users")
    .select("auth_id, username, profile_image_url, avatar, gender, elo")
    .ilike("username", `${trimmedQuery}%`)
    .order("username", { ascending: true })
    .limit(limit + 1);

  if (excludeAuthId) {
    supabaseQuery = supabaseQuery.neq("auth_id", excludeAuthId);
  }

  const { data, error } = await supabaseQuery;

  if (error) {
    throw new Error(error.message);
  }

  const hasMore = (data?.length || 0) > limit;
  const results = (data || []).slice(0, limit);

  return { results, hasMore };
};

// ---------------- SEARCH USERS ----------------
export const searchUsers = async (query, gender, options = {}) => {
  const trimmedQuery = query?.trim();

  const page = Math.max(Number(options.page) || 1, 1);
  const limit = Math.min(Math.max(Number(options.limit) || 10, 1), 25);
  const offset = (page - 1) * limit;

  if (!trimmedQuery || trimmedQuery.length < 2) {
    return { results: [], page, hasMore: false };
  }

  let supabaseQuery = supabase
    .from("users")
    .select("auth_id, username, gender, elo")
    .ilike("username", `%${trimmedQuery}%`)
    .order("elo", { ascending: false })
    .range(offset, offset + limit);

  if (gender) {
    supabaseQuery = supabaseQuery.eq("gender", gender);
  }

  const { data, error } = await supabaseQuery;

  if (error) {
    throw new Error(error.message);
  }

  const hasMore = (data?.length || 0) > limit;
  const results = (data || []).slice(0, limit);

  return { results, page, hasMore };
};

// ---------------- USER PROFILE WITH STATS BY USERNAME ----------------
export const getUserProfileWithStats = async (username) => {
  const normalizedUsername = username?.trim().toLowerCase();

  if (!normalizedUsername) {
    return { error: "Username is required", status: 400 };
  }

  const { data: user, error: userError } = await supabase
    .from("users")
    .select(
      "auth_id, username, gender, avatar, region, address, bio, profile_image_url, elo"
    )
    .eq("username", normalizedUsername)
    .maybeSingle();

  if (userError) {
    return { error: userError.message, status: 400 };
  }

  if (!user) {
    return { error: "User not found", status: 404 };
  }

  const [winRateResult, bestMatchResult, totalMatchesResult] = await Promise.all([
    supabase.rpc("get_win_rate_last10", { user_auth_id: user.auth_id }),
    supabase.rpc("get_best_match", { user_auth_id: user.auth_id }),
    supabase
      .from("match_players")
      .select("*", { count: "exact", head: true })
      .eq("auth_id", user.auth_id),
  ]);

  if (winRateResult.error) {
    return { error: winRateResult.error.message, status: 400 };
  }

  if (bestMatchResult.error) {
    return { error: bestMatchResult.error.message, status: 400 };
  }

  if (totalMatchesResult.error) {
    return { error: totalMatchesResult.error.message, status: 400 };
  }

  const tierInfo = buildTierInfo(user.elo ?? 0);
  const bestMatch =
    bestMatchResult.data && bestMatchResult.data.length > 0
      ? bestMatchResult.data[0]
      : null;

  return {
    profile: user,
    stats: {
      tier: tierInfo.tier,
      star_rating: tierInfo.star_rating,
      win_rate_last_10: winRateResult.data ?? 0,
      best_match: bestMatch,
      total_matches: totalMatchesResult.count ?? 0,
      matches_this_week: 0,
    },
  };
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

// ---------------- DELETE USER ----------------
export const deleteUserAndData = async (authId) => {
  const errors = [];

  const handleStep = async (operation) => {
    const { error } = await operation();

    if (error && error.message?.toLowerCase() !== "object not found") {
      errors.push(error.message);
    }
  };

  await handleStep(() =>
    supabase
      .from("matchmaking_queue")
      .delete()
      .eq("auth_id", authId)
  );

  await handleStep(() =>
    supabase
      .from("elo_history")
      .delete()
      .eq("auth_id", authId)
  );

  await handleStep(() =>
    supabase.storage.from("profile-images").remove([`users/${authId}.jpg`])
  );

  await handleStep(() => supabase.from("users").delete().eq("auth_id", authId));

  const { error: authError } = await supabase.auth.admin.deleteUser(authId);
  if (authError) {
    errors.push(authError.message);
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true };
};
