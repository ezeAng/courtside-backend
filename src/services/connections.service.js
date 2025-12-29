import { supabase } from "../config/supabase.js";

const PROFILE_FIELDS = [
  "auth_id",
  "username",
  "gender",
  "profile_image_url",
  "bio",
  "region",
  "singles_elo",
  "doubles_elo",
  "overall_elo",
  "singles_matches_played",
  "doubles_matches_played",
].join(", ");

const REQUEST_PROFILE_FIELDS = [
  "auth_id",
  "username",
  "profile_image_url",
  "overall_elo",
  "region",
].join(", ");

const normalizeLimit = (value, defaultValue = 20) =>
  Math.min(Math.max(Number(value) || defaultValue, 1), 50);

const getExcludedAuthIds = async (authId) => {
  const [{ data: connections, error: connectionsError }, { data: requests, error: requestsError }] =
    await Promise.all([
      supabase
        .from("connections")
        .select("user_a_auth_id, user_b_auth_id")
        .or(`user_a_auth_id.eq.${authId},user_b_auth_id.eq.${authId}`),
      supabase
        .from("connection_requests")
        .select("sender_auth_id, receiver_auth_id")
        .eq("status", "pending")
        .or(`sender_auth_id.eq.${authId},receiver_auth_id.eq.${authId}`),
    ]);

  if (connectionsError) throw new Error(connectionsError.message);
  if (requestsError) throw new Error(requestsError.message);

  const excludedIds = new Set([authId]);

  (connections || []).forEach((connection) => {
    excludedIds.add(connection.user_a_auth_id);
    excludedIds.add(connection.user_b_auth_id);
  });

  (requests || []).forEach((request) => {
    excludedIds.add(request.sender_auth_id);
    excludedIds.add(request.receiver_auth_id);
  });

  return excludedIds;
};

export const searchUsersForConnections = async (authId, query, options = {}) => {
  const trimmedQuery = query?.trim();
  const limit = normalizeLimit(options.limit);

  if (!trimmedQuery) {
    return { results: [] };
  }

  const excludedIds = await getExcludedAuthIds(authId);

  const { data, error } = await supabase
    .from("users")
    .select(PROFILE_FIELDS)
    .ilike("username", `%${trimmedQuery}%`)
    .order("username", { ascending: true })
    .limit(limit * 2);

  if (error) throw new Error(error.message);

  const filtered = (data || []).filter((user) => !excludedIds.has(user.auth_id)).slice(0, limit);

  return { results: filtered };
};

export const getRecommendedUsers = async (authId, mode, region, options = {}) => {
  const normalizedMode = mode?.toLowerCase();
  const limit = normalizeLimit(options.limit);
  const fetchLimit = Math.min(limit * 5, 200);
  const gender = options.gender?.toLowerCase();

  if (!normalizedMode || !["singles", "doubles"].includes(normalizedMode)) {
    return { error: "mode must be either singles or doubles", status: 400 };
  }

  const eloColumn = normalizedMode === "doubles" ? "doubles_elo" : "singles_elo";

  const { data: requester, error: requesterError } = await supabase
    .from("users")
    .select(`auth_id, ${eloColumn}`)
    .eq("auth_id", authId)
    .single();

  if (requesterError) throw new Error(requesterError.message);

  const targetElo = requester?.[eloColumn] ?? 0;
  const excludedIds = await getExcludedAuthIds(authId);

  let query = supabase
    .from("users")
    .select(PROFILE_FIELDS)
    .neq("auth_id", authId)
    .limit(fetchLimit);

  if (region) {
    query = query.eq("region", region);
  }

  const { data, error } = await query;

  if (error) throw new Error(error.message);

  const filtered = (data || []).filter((user) => {
    if (excludedIds.has(user.auth_id)) {
      return false;
    }

    if (gender && user.gender?.toLowerCase() !== gender) {
      return false;
    }

    return true;
  });

  if (gender && filtered.length === 0) {
    return { results: [] };
  }

  const ranked = filtered
    .map((user) => ({
      ...user,
      elo_diff: Math.abs((user[eloColumn] ?? 0) - targetElo),
    }))
    .sort((a, b) => a.elo_diff - b.elo_diff)
    .slice(0, limit)
    .map(({ elo_diff, ...user }) => user);

  return { results: ranked };
};

const userExists = async (authId) => {
  const { data, error } = await supabase
    .from("users")
    .select("auth_id")
    .eq("auth_id", authId)
    .single();

  if (error) {
    if (error.code === "PGRST116" || error.message?.toLowerCase().includes("row not found")) {
      return false;
    }

    throw new Error(error.message);
  }

  return !!data;
};

const connectionExistsBetween = async (authIdA, authIdB) => {
  const { data, error } = await supabase
    .from("connections")
    .select("id")
    .or(
      `and(user_a_auth_id.eq.${authIdA},user_b_auth_id.eq.${authIdB}),and(user_a_auth_id.eq.${authIdB},user_b_auth_id.eq.${authIdA})`
    )
    .maybeSingle();

  if (error) throw new Error(error.message);

  return !!data;
};

const pendingRequestExists = async (senderId, receiverId) => {
  const { data, error } = await supabase
    .from("connection_requests")
    .select("id")
    .eq("sender_auth_id", senderId)
    .eq("receiver_auth_id", receiverId)
    .eq("status", "pending")
    .maybeSingle();

  if (error) throw new Error(error.message);

  return !!data;
};

export const sendConnectionRequest = async (senderAuthId, receiverAuthId) => {
  if (!receiverAuthId) {
    return { error: "receiver_auth_id is required", status: 400 };
  }

  if (senderAuthId === receiverAuthId) {
    return { error: "You cannot send a request to yourself", status: 400 };
  }

  const receiverExists = await userExists(receiverAuthId);

  if (!receiverExists) {
    return { error: "Receiver not found", status: 404 };
  }

  const alreadyConnected = await connectionExistsBetween(senderAuthId, receiverAuthId);

  if (alreadyConnected) {
    return { error: "Users are already connected", status: 400 };
  }

  const hasPending = await pendingRequestExists(senderAuthId, receiverAuthId);

  const hasIncomingPending = await pendingRequestExists(receiverAuthId, senderAuthId);

  if (hasPending || hasIncomingPending) {
    return { error: "A pending request already exists", status: 400 };
  }

  const { error } = await supabase.from("connection_requests").insert({
    sender_auth_id: senderAuthId,
    receiver_auth_id: receiverAuthId,
    status: "pending",
  });

  if (error) throw new Error(error.message);

  return { success: true };
};

export const cancelConnectionRequest = async (authId, requestId) => {
  if (!requestId) {
    return { error: "request_id is required", status: 400 };
  }

  const { data: request, error: requestError } = await supabase
    .from("connection_requests")
    .select("id, sender_auth_id, status")
    .eq("id", requestId)
    .single();

  if (requestError) {
    if (requestError.code === "PGRST116" || requestError.message?.toLowerCase().includes("row not found")) {
      return { error: "Request not found", status: 404 };
    }

    throw new Error(requestError.message);
  }

  if (request.sender_auth_id !== authId) {
    return { error: "Only the sender can cancel this request", status: 403 };
  }

  if (request.status !== "pending") {
    return { error: "Only pending requests can be cancelled", status: 400 };
  }

  const { error } = await supabase
    .from("connection_requests")
    .update({ status: "cancelled" })
    .eq("id", requestId);

  if (error) throw new Error(error.message);

  return { success: true };
};

export const acceptConnectionRequest = async (authId, requestId) => {
  if (!requestId) {
    return { error: "request_id is required", status: 400 };
  }

  const { data: request, error: requestError } = await supabase
    .from("connection_requests")
    .select("id, receiver_auth_id, status")
    .eq("id", requestId)
    .single();

  if (requestError) {
    if (requestError.code === "PGRST116" || requestError.message?.toLowerCase().includes("row not found")) {
      return { error: "Request not found", status: 404 };
    }

    throw new Error(requestError.message);
  }

  if (request.receiver_auth_id !== authId) {
    return { error: "Only the receiver can accept this request", status: 403 };
  }

  if (request.status !== "pending") {
    return { error: "Only pending requests can be accepted", status: 400 };
  }

  const { error } = await supabase
    .from("connection_requests")
    .update({ status: "accepted" })
    .eq("id", requestId);

  if (error) throw new Error(error.message);

  return { success: true };
};

const fetchProfilesByAuthIds = async (authIds, fields = PROFILE_FIELDS) => {
  if (!authIds?.length) return {};

  const { data, error } = await supabase
    .from("users")
    .select(fields)
    .in("auth_id", authIds);

  if (error) throw new Error(error.message);

  return (data || []).reduce((acc, profile) => {
    acc[profile.auth_id] = profile;
    return acc;
  }, {});
};

export const listIncomingRequests = async (authId) => {
  const { data, error } = await supabase
    .from("connection_requests")
    .select("id, sender_auth_id, receiver_auth_id, status, created_at")
    .eq("receiver_auth_id", authId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const senderIds = (data || []).map((request) => request.sender_auth_id);
  const profiles = await fetchProfilesByAuthIds(senderIds, REQUEST_PROFILE_FIELDS);

  return (data || []).map((request) => ({
    id: request.id,
    sender: profiles[request.sender_auth_id] || null,
    created_at: request.created_at,
    status: request.status,
  }));
};

export const listOutgoingRequests = async (authId) => {
  const { data, error } = await supabase
    .from("connection_requests")
    .select("id, sender_auth_id, receiver_auth_id, status, created_at")
    .eq("sender_auth_id", authId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) throw new Error(error.message);

  const receiverIds = (data || []).map((request) => request.receiver_auth_id);
  const profiles = await fetchProfilesByAuthIds(receiverIds, REQUEST_PROFILE_FIELDS);

  return (data || []).map((request) => ({
    id: request.id,
    receiver: profiles[request.receiver_auth_id] || null,
    created_at: request.created_at,
    status: request.status,
  }));
};

export const listConnections = async (authId) => {
  const { data, error } = await supabase
    .from("connections")
    .select("id, user_a_auth_id, user_b_auth_id, connected_at")
    .or(`user_a_auth_id.eq.${authId},user_b_auth_id.eq.${authId}`)
    .order("connected_at", { ascending: false });

  if (error) throw new Error(error.message);

  const otherUserIds = (data || []).map((connection) =>
    connection.user_a_auth_id === authId ? connection.user_b_auth_id : connection.user_a_auth_id
  );

  const profiles = await fetchProfilesByAuthIds(otherUserIds);

  return (data || []).map((connection) => {
    const otherUserId =
      connection.user_a_auth_id === authId ? connection.user_b_auth_id : connection.user_a_auth_id;

    return {
      id: connection.id,
      connected_at: connection.connected_at,
      user: profiles[otherUserId] || null,
    };
  });
};
