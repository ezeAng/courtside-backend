import { getSupabaseUserClient, supabase } from "../config/supabase.js";

const ERROR_CODES = {
  CLUB_NOT_FOUND: "CLUB_NOT_FOUND",
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  INVALID_UPDATES: "INVALID_UPDATES",
  PREMIUM_REQUIRED: "PREMIUM_REQUIRED",
  MEMBERSHIP_NOT_FOUND: "MEMBERSHIP_NOT_FOUND",
  INVALID_MEMBERSHIP_STATUS: "INVALID_MEMBERSHIP_STATUS",
  LAST_ADMIN: "LAST_ADMIN",
  CORE_ADMIN_ONLY: "CORE_ADMIN_ONLY",
};

const buildError = (code, status = 400) => ({ error: code, status });

const getMembership = async (clubId, authId) => {
  const { data, error } = await supabase
    .from("club_memberships")
    .select("id, role, status")
    .eq("club_id", clubId)
    .eq("user_id", authId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw new Error(error.message);
  }

  return data || null;
};

const requireActiveAdmin = async (clubId, authId) => {
  const membership = await getMembership(clubId, authId);

  if (!membership || membership.status !== "active") {
    return { allowed: false, status: 403, error: ERROR_CODES.FORBIDDEN };
  }

  const isAdmin = membership.role === "admin" || membership.role === "core_admin";

  if (!isAdmin) {
    return { allowed: false, status: 403, error: ERROR_CODES.FORBIDDEN };
  }

  return { allowed: true, membership };
};

const requireCoreAdmin = async (clubId, authId) => {
  const membership = await getMembership(clubId, authId);

  if (!membership || membership.status !== "active" || membership.role !== "core_admin") {
    return { allowed: false, status: 403, error: ERROR_CODES.CORE_ADMIN_ONLY };
  }

  return { allowed: true, membership };
};

const ensureClubActive = async (clubId) => {
  const { data: club, error } = await supabase
    .from("clubs")
    .select(
      "id, name, description, emblem_url, visibility, max_members, playing_cadence, usual_venues, contact_info, created_by, is_active"
    )
    .eq("id", clubId)
    .maybeSingle();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    throw new Error(error.message);
  }

  if (!club || club.is_active === false) {
    return null;
  }

  return club;
};

const getPremiumStatus = async (authId) => {
  const { data, error } = await supabase
    .from("users")
    .select("membership_tier, is_premium")
    .eq("auth_id", authId)
    .maybeSingle();

  if (error) {
    if (error.code === "PGRST116") {
      return null;
    }
    throw new Error(error.message);
  }

  return data || null;
};

export const createClub = async (authId, payload, accessToken) => {
  if (!authId) {
    return buildError(ERROR_CODES.UNAUTHORIZED, 401);
  }

  const premiumStatus = await getPremiumStatus(authId);

  if (!premiumStatus || premiumStatus.membership_tier !== "pro" || premiumStatus.is_premium !== true) {
    return buildError(ERROR_CODES.PREMIUM_REQUIRED, 403);
  }

  if (!accessToken) {
    return buildError(ERROR_CODES.UNAUTHORIZED, 401);
  }

  const userClient = getSupabaseUserClient(accessToken);
  const { data, error } = await userClient.rpc("create_club_with_admin", {
    p_name: payload?.p_name ?? payload?.name,
    p_description: payload?.p_description ?? payload?.description,
    p_emblem_url: payload?.p_emblem_url ?? payload?.emblem_url,
    p_visibility: payload?.p_visibility ?? payload?.visibility,
    p_max_members: payload?.p_max_members ?? payload?.max_members ?? null,
    p_playing_cadence: payload?.p_playing_cadence ?? payload?.playing_cadence,
    p_usual_venues: payload?.p_usual_venues ?? payload?.usual_venues,
    p_contact_info: payload?.p_contact_info ?? payload?.contact_info,
  });

  if (error) {
    console.log(error)
    return { error: error.message, status: 400 };
  }

  const clubId = data;

  const membership = await getMembership(clubId, authId);
  if (!membership) {
    const { error: membershipError } = await userClient.from("club_memberships").insert({
      club_id: clubId,
      user_id: authId,
      role: "core_admin",
      status: "active",
      approved_at: new Date().toISOString(),
      approved_by: authId,
    });

    if (membershipError) {
      return { error: membershipError.message, status: 400 };
    }
  }

  return { club_id: clubId };
};

export const listPublicClubs = async () => {
  const { data: clubs, error } = await supabase
    .from("clubs")
    .select(
      "id, name, description, emblem_url, visibility, max_members, playing_cadence, usual_venues, contact_info, created_at"
    )
    .eq("visibility", "public")
    .eq("is_active", true)
    .order("created_at", { ascending: false });

  if (error) {
    return { error: error.message, status: 400 };
  }

  const clubIds = (clubs || []).map((club) => club.id);
  let membershipCounts = new Map();

  if (clubIds.length > 0) {
    const { data: memberships, error: membershipError } = await supabase
      .from("club_memberships")
      .select("club_id, status")
      .in("club_id", clubIds)
      .eq("status", "active");

    if (membershipError) {
      return { error: membershipError.message, status: 400 };
    }

    membershipCounts = (memberships || []).reduce((acc, membership) => {
      acc.set(membership.club_id, (acc.get(membership.club_id) || 0) + 1);
      return acc;
    }, new Map());
  }

  const items = (clubs || []).map((club) => ({
    ...club,
    active_member_count: membershipCounts.get(club.id) || 0,
  }));

  return { clubs: items };
};

export const searchClubs = async (query) => {
  const trimmedQuery = query?.trim();

  if (!trimmedQuery) {
    return { results: [] };
  }

  const { data: clubs, error } = await supabase
    .from("clubs")
    .select(
      "id, name, description, emblem_url, visibility, max_members, playing_cadence, usual_venues, contact_info, created_at"
    )
    .eq("is_active", true)
    .eq("visibility", "public")
    .order("created_at", { ascending: false });

  if (error) {
    return { error: error.message, status: 400 };
  }

  const lowered = trimmedQuery.toLowerCase();
  const filtered = (clubs || []).filter((club) => {
    const nameMatch = club.name?.toLowerCase().includes(lowered);
    const descMatch = club.description?.toLowerCase().includes(lowered);
    return nameMatch || descMatch;
  });

  return {
    results: filtered.map((club) => ({
      ...club,
      is_private: club.visibility === "private",
    })),
  };
};

export const getClubById = async (clubId, authId) => {
  const club = await ensureClubActive(clubId);

  if (!club) {
    return buildError(ERROR_CODES.CLUB_NOT_FOUND, 404);
  }

  let membership = null;

  if (authId) {
    membership = await getMembership(clubId, authId);
  }

  if (club.visibility === "private") {
    if (!membership || !["active", "requested"].includes(membership.status)) {
      return buildError(ERROR_CODES.FORBIDDEN, 403);
    }
  }

  return {
    club,
    membership_status: membership?.status ?? null,
    membership_role: membership?.role ?? null,
  };
};

export const updateClub = async (clubId, authId, updates) => {
  const club = await ensureClubActive(clubId);

  if (!club) {
    return buildError(ERROR_CODES.CLUB_NOT_FOUND, 404);
  }

  const access = await requireActiveAdmin(clubId, authId);

  if (!access.allowed) {
    return buildError(access.error, access.status);
  }

  const allowedFields = [
    "name",
    "description",
    "emblem_url",
    "contact_info",
    "playing_cadence",
    "usual_venues",
  ];

  const updateData = Object.entries(updates || {}).reduce((acc, [key, value]) => {
    if (allowedFields.includes(key) && value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {});

  if (Object.keys(updateData).length === 0) {
    return buildError(ERROR_CODES.INVALID_UPDATES, 400);
  }

  const { error } = await supabase.from("clubs").update(updateData).eq("id", clubId);

  if (error) {
    return { error: error.message, status: 400 };
  }

  return { success: true };
};

export const updateClubEmblem = async (clubId, authId, file) => {
  const club = await ensureClubActive(clubId);

  if (!club) {
    return buildError(ERROR_CODES.CLUB_NOT_FOUND, 404);
  }

  const access = await requireActiveAdmin(clubId, authId);

  if (!access.allowed) {
    return buildError(access.error, access.status);
  }

  const storagePath = `clubs/${clubId}.jpg`;

  const { error: uploadError } = await supabase.storage
    .from("club-emblems")
    .upload(storagePath, file.buffer, {
      contentType: file.mimetype,
      upsert: true,
    });

  if (uploadError) {
    return { error: uploadError.message, status: 400 };
  }

  const { data: publicUrlData } = supabase.storage
    .from("club-emblems")
    .getPublicUrl(storagePath);

  const publicUrl = publicUrlData?.publicUrl;

  const { error: updateError } = await supabase
    .from("clubs")
    .update({ emblem_url: publicUrl })
    .eq("id", clubId);

  if (updateError) {
    return { error: updateError.message, status: 400 };
  }

  return { success: true, emblem_url: publicUrl };
};

export const deleteClub = async (clubId, authId) => {
  const club = await ensureClubActive(clubId);

  if (!club) {
    return buildError(ERROR_CODES.CLUB_NOT_FOUND, 404);
  }

  const access = await requireCoreAdmin(clubId, authId);

  if (!access.allowed) {
    return buildError(access.error, access.status);
  }

  const { error } = await supabase.from("clubs").update({ is_active: false }).eq("id", clubId);

  if (error) {
    return { error: error.message, status: 400 };
  }

  return { success: true };
};

export const requestOrJoinClub = async (clubId, authId, accessToken) => {
  if (!authId) {
    return buildError(ERROR_CODES.UNAUTHORIZED, 401);
  }

  if (!accessToken) {
    return buildError(ERROR_CODES.UNAUTHORIZED, 401);
  }

  const userClient = getSupabaseUserClient(accessToken);
  const { data, error } = await userClient.rpc("request_or_join_club", { p_club_id: clubId });

  if (error) {
    return { error: error.message, status: 400 };
  }

  return data;
};

export const leaveClub = async (clubId, authId) => {
  if (!authId) {
    return buildError(ERROR_CODES.UNAUTHORIZED, 401);
  }

  const membership = await getMembership(clubId, authId);

  if (!membership) {
    return buildError(ERROR_CODES.MEMBERSHIP_NOT_FOUND, 404);
  }

  if (membership.status !== "active") {
    return buildError(ERROR_CODES.INVALID_MEMBERSHIP_STATUS, 400);
  }

  if (membership.role === "core_admin") {
    const { count, error } = await supabase
      .from("club_memberships")
      .select("id", { count: "exact", head: true })
      .eq("club_id", clubId)
      .eq("status", "active")
      .in("role", ["admin", "core_admin"]);

    if (error) {
      return { error: error.message, status: 400 };
    }

    if ((count || 0) <= 1) {
      return buildError(ERROR_CODES.LAST_ADMIN, 400);
    }
  }

  const { error } = await supabase
    .from("club_memberships")
    .update({ status: "left" })
    .eq("id", membership.id);

  if (error) {
    return { error: error.message, status: 400 };
  }

  return { success: true };
};

export const listMyClubs = async (authId) => {
  if (!authId) {
    return buildError(ERROR_CODES.UNAUTHORIZED, 401);
  }

  const { data, error } = await supabase
    .from("club_memberships")
    .select(
      "club_id, role, status, clubs(id, name, description, emblem_url, visibility, playing_cadence, usual_venues, contact_info, is_active)"
    )
    .eq("user_id", authId)
    .eq("status", "active")
    .eq("clubs.is_active", true);

  if (error) {
    return { error: error.message, status: 400 };
  }

  const clubs = (data || [])
    .filter((row) => row.clubs)
    .map((row) => ({
      ...row.clubs,
      role: row.role,
    }));

  return { clubs };
};

export const listClubRequests = async (clubId, authId) => {
  const access = await requireActiveAdmin(clubId, authId);

  if (!access.allowed) {
    return buildError(access.error, access.status);
  }

  const { data, error } = await supabase
    .from("club_memberships")
    .select("id, user_id, role, status, created_at")
    .eq("club_id", clubId)
    .eq("status", "requested")
    .order("created_at", { ascending: true });

  if (error) {
    return { error: error.message, status: 400 };
  }

  const userIds = (data || []).map((row) => row.user_id);
  let usersById = new Map();

  if (userIds.length > 0) {
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("auth_id, username, profile_image_url, overall_elo, region")
      .in("auth_id", userIds);

    if (usersError) {
      return { error: usersError.message, status: 400 };
    }

    usersById = (users || []).reduce((acc, user) => {
      acc.set(user.auth_id, user);
      return acc;
    }, new Map());
  }

  const requests = (data || []).map((row) => ({
    ...row,
    users: usersById.get(row.user_id) || null,
  }));

  return { requests };
};

export const approveClubMember = async (clubId, userId, authId, accessToken) => {
  const access = await requireActiveAdmin(clubId, authId);

  if (!access.allowed) {
    return buildError(access.error, access.status);
  }

  if (!accessToken) {
    return buildError(ERROR_CODES.UNAUTHORIZED, 401);
  }

  const userClient = getSupabaseUserClient(accessToken);
  const { error } = await userClient.rpc("approve_club_member", {
    p_club_id: clubId,
    p_user_id: userId,
  });

  if (error) {
    return { error: error.message, status: 400 };
  }

  return { success: true };
};

export const rejectClubMember = async (clubId, userId, authId) => {
  const access = await requireActiveAdmin(clubId, authId);

  if (!access.allowed) {
    return buildError(access.error, access.status);
  }

  const { data: membership, error: lookupError } = await supabase
    .from("club_memberships")
    .select("id, status")
    .eq("club_id", clubId)
    .eq("user_id", userId)
    .maybeSingle();

  if (lookupError) {
    if (lookupError.code === "PGRST116") {
      return buildError(ERROR_CODES.MEMBERSHIP_NOT_FOUND, 404);
    }
    return { error: lookupError.message, status: 400 };
  }

  if (!membership) {
    return buildError(ERROR_CODES.MEMBERSHIP_NOT_FOUND, 404);
  }

  if (membership.status !== "requested") {
    return buildError(ERROR_CODES.INVALID_MEMBERSHIP_STATUS, 400);
  }

  const { error } = await supabase
    .from("club_memberships")
    .update({ status: "rejected" })
    .eq("id", membership.id);

  if (error) {
    return { error: error.message, status: 400 };
  }

  return { success: true };
};

export const removeClubMember = async (clubId, userId, authId) => {
  const access = await requireActiveAdmin(clubId, authId);

  if (!access.allowed) {
    return buildError(access.error, access.status);
  }

  const { data: membership, error: lookupError } = await supabase
    .from("club_memberships")
    .select("id, role")
    .eq("club_id", clubId)
    .eq("user_id", userId)
    .maybeSingle();

  if (lookupError) {
    if (lookupError.code === "PGRST116") {
      return buildError(ERROR_CODES.MEMBERSHIP_NOT_FOUND, 404);
    }
    return { error: lookupError.message, status: 400 };
  }

  if (!membership) {
    return buildError(ERROR_CODES.MEMBERSHIP_NOT_FOUND, 404);
  }

  if (membership.role === "core_admin") {
    return buildError(ERROR_CODES.CORE_ADMIN_ONLY, 403);
  }

  const { error } = await supabase
    .from("club_memberships")
    .update({ status: "kicked" })
    .eq("id", membership.id);

  if (error) {
    return { error: error.message, status: 400 };
  }

  return { success: true };
};

export const getClubLeague = async (clubId, authId) => {
  const membership = await getMembership(clubId, authId);

  if (!membership || membership.status !== "active") {
    return buildError(ERROR_CODES.FORBIDDEN, 403);
  }

  const { data, error } = await supabase
    .from("club_memberships")
    .select("user_id")
    .eq("club_id", clubId)
    .eq("status", "active")
    .order("created_at", { ascending: true });

  if (error) {
    return { error: error.message, status: 400 };
  }

  const userIds = (data || []).map((row) => row.user_id);
  let users = [];

  if (userIds.length > 0) {
    const { data: usersData, error: usersError } = await supabase
      .from("users")
      .select("auth_id, username, profile_image_url, overall_elo, gender, region")
      .in("auth_id", userIds)
      .order("overall_elo", { ascending: false });

    if (usersError) {
      return { error: usersError.message, status: 400 };
    }

    users = usersData || [];
  }

  const leaderboard = users.map((user, index) => ({
    ...user,
    rank: index + 1,
  }));

  return { club_id: clubId, leaderboard };
};

export const ERROR_CODES_MAP = ERROR_CODES;
