import { supabase } from "../config/supabase.js";

const buildTierInfo = (rating = 0) => {
  let tier = "Bronze";

  if (rating >= 900 && rating < 1100) tier = "Silver";
  if (rating >= 1100 && rating < 1300) tier = "Gold";
  if (rating >= 1300 && rating < 1500) tier = "Platinum";
  if (rating >= 1500) tier = "Diamond";

  const star_rating = Math.max(1, Math.min(5, Math.round(rating / 300)));

  return { tier, star_rating };
};

export const getContactDetailsForConnection = async (requesterAuthId, targetAuthId) => {
  if (!requesterAuthId || !targetAuthId) {
    return { error: "Forbidden", status: 403 };
  }

  if (requesterAuthId === targetAuthId) {
    return { error: "Forbidden", status: 403 };
  }

  const { data: targetUser, error: targetError } = await supabase
    .from("users")
    .select(
      "auth_id, phone_number, contact_email, is_profile_private, share_contact_with_connections"
    )
    .eq("auth_id", targetAuthId)
    .maybeSingle();

  if (targetError) {
    if (targetError.code === "PGRST116" || targetError.message?.toLowerCase().includes("row not found")) {
      return { error: "User not found", status: 404 };
    }

    throw new Error(targetError.message);
  }

  if (!targetUser) {
    return { error: "User not found", status: 404 };
  }

  const { data: connection, error: connectionError } = await supabase
    .from("connections")
    .select("id")
    .or(
      `and(user_a_auth_id.eq.${requesterAuthId},user_b_auth_id.eq.${targetAuthId}),and(user_a_auth_id.eq.${targetAuthId},user_b_auth_id.eq.${requesterAuthId})`
    )
    .maybeSingle();

  if (connectionError) {
    throw new Error(connectionError.message);
  }

  if (!connection) {
    return { error: "Forbidden", status: 403 };
  }

  if (targetUser.is_profile_private) {
    return { error: "Forbidden", status: 403 };
  }

  if (!targetUser.share_contact_with_connections) {
    return { error: "Forbidden", status: 403 };
  }

  const contact = {};

  if (targetUser.phone_number) {
    contact.phone_number = targetUser.phone_number;
  }

  if (targetUser.contact_email) {
    contact.contact_email = targetUser.contact_email;
  }

  return { contact };
};

// ---------------- GET PROFILE ----------------
export const getProfile = async (auth_id) => {
  const { data, error } = await supabase
    .from("users")
    .select(
      "auth_id, username, gender, avatar, region, address, bio, profile_image_url, singles_elo, doubles_elo, overall_elo, is_profile_private, share_contact_with_connections"
    )
    .eq("auth_id", auth_id)
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
    .select("auth_id, username, profile_image_url, avatar, gender, singles_elo, doubles_elo, overall_elo")
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
export const searchUsers = async (query, gender, options = {}, client = supabase) => {
  const trimmedQuery = query?.trim();
  const validDisciplines = ["singles", "doubles"];
  const discipline = (options.discipline || "singles").toLowerCase();

  if (!validDisciplines.includes(discipline)) {
    return { error: "Invalid discipline" };
  }

  const ratingColumn = discipline === "doubles" ? "doubles_elo" : "singles_elo";

  const page = Math.max(Number(options.page) || 1, 1);
  const limit = Math.min(Math.max(Number(options.limit) || 10, 1), 25);
  const offset = (page - 1) * limit;

  if (!trimmedQuery || trimmedQuery.length < 2) {
    return { results: [], page, hasMore: false };
  }

  let supabaseQuery = client
    .from("users")
    .select("auth_id, username, gender, singles_elo, doubles_elo, overall_elo")
    .ilike("username", `%${trimmedQuery}%`)
    .order(ratingColumn, { ascending: false })
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
      "auth_id, username, gender, avatar, region, address, bio, profile_image_url, singles_elo, doubles_elo, overall_elo"
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

  let overallRank = null;

  if (user.overall_elo !== undefined && user.overall_elo !== null) {
    const { count: higherOverallCount, error: overallRankError } = await supabase
      .from("users")
      .select("auth_id", { count: "exact", head: true })
      .gt("overall_elo", user.overall_elo);

    if (overallRankError) {
      return { error: overallRankError.message, status: 400 };
    }

    overallRank = (higherOverallCount ?? 0) + 1;
  }

  const primaryRating = user.overall_elo ?? user.singles_elo ?? 0;
  const tierInfo = buildTierInfo(primaryRating);
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
      overall: {
        overall_elo: user.overall_elo ?? null,
        rank: overallRank,
      },
      ratings: {
        singles_elo: user.singles_elo ?? null,
        doubles_elo: user.doubles_elo ?? null,
        overall_elo: user.overall_elo ?? null,
      },
    },
  };
};

// ---------------- LIST OTHER USERS ----------------
export const listOtherUsers = async (auth_id) => {
  const { data, error } = await supabase
    .from("users")
    .select("auth_id, username, gender, singles_elo, doubles_elo, overall_elo")
    .neq("auth_id", auth_id)
    .order("singles_elo", { ascending: false });

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
