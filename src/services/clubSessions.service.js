import { supabase } from "../config/supabase.js";

const ERROR_CODES = {
  UNAUTHORIZED: "UNAUTHORIZED",
  FORBIDDEN: "FORBIDDEN",
  CLUB_NOT_FOUND: "CLUB_NOT_FOUND",
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
  INVALID_UPDATES: "INVALID_UPDATES",
};

const buildError = (code, status = 400) => ({ error: code, status });

const getMembership = async (clubId, authId) => {
  const { data, error } = await supabase
    .from("club_memberships")
    .select("role, status")
    .eq("club_id", clubId)
    .eq("user_id", authId)
    .maybeSingle();

  if (error && error.code !== "PGRST116") {
    throw new Error(error.message);
  }

  return data || null;
};

const requireActiveMember = async (clubId, authId) => {
  const membership = await getMembership(clubId, authId);

  if (!membership || membership.status !== "active") {
    return { allowed: false, status: 403, error: ERROR_CODES.FORBIDDEN };
  }

  return { allowed: true, membership };
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

const ensureClubActive = async (clubId) => {
  const { data: club, error } = await supabase
    .from("clubs")
    .select("id, is_active")
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

export const createClubSession = async (clubId, authId, payload) => {
  if (!authId) {
    return buildError(ERROR_CODES.UNAUTHORIZED, 401);
  }

  const club = await ensureClubActive(clubId);

  if (!club) {
    return buildError(ERROR_CODES.CLUB_NOT_FOUND, 404);
  }

  const access = await requireActiveAdmin(clubId, authId);

  if (!access.allowed) {
    return buildError(access.error, access.status);
  }

  const sessionData = {
    club_id: clubId,
    source: "club_created",
    session_type: payload?.session_type,
    title: payload?.title,
    start_time: payload?.start_time,
    end_time: payload?.end_time,
    venue: payload?.venue,
    capacity: payload?.capacity,
    status: "scheduled",
    host_auth_id: authId,
  };

  const { data, error } = await supabase
    .from("sessions")
    .insert(sessionData)
    .select("id")
    .single();

  if (error) {
    return { error: error.message, status: 400 };
  }

  return { session_id: data.id };
};

export const listClubSessions = async (clubId, authId) => {
  if (!authId) {
    return buildError(ERROR_CODES.UNAUTHORIZED, 401);
  }

  const club = await ensureClubActive(clubId);

  if (!club) {
    return buildError(ERROR_CODES.CLUB_NOT_FOUND, 404);
  }

  const access = await requireActiveMember(clubId, authId);

  if (!access.allowed) {
    return buildError(access.error, access.status);
  }

  const { data, error } = await supabase
    .from("sessions")
    .select("id, title, start_time, end_time, venue, capacity, session_type, status, club_id")
    .eq("club_id", clubId)
    .eq("source", "club_created")
    .order("start_time", { ascending: true });

  if (error) {
    return { error: error.message, status: 400 };
  }

  return { sessions: data || [] };
};

export const updateClubSession = async (sessionId, authId, updates) => {
  if (!authId) {
    return buildError(ERROR_CODES.UNAUTHORIZED, 401);
  }

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id, source, club_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) {
    if (sessionError.code === "PGRST116") {
      return buildError(ERROR_CODES.SESSION_NOT_FOUND, 404);
    }
    return { error: sessionError.message, status: 400 };
  }

  if (!session) {
    return buildError(ERROR_CODES.SESSION_NOT_FOUND, 404);
  }

  if (session.source !== "club_created") {
    return buildError(ERROR_CODES.FORBIDDEN, 403);
  }

  const access = await requireActiveAdmin(session.club_id, authId);

  if (!access.allowed) {
    return buildError(access.error, access.status);
  }

  const allowedFields = ["title", "start_time", "end_time", "venue", "capacity", "session_type"];

  const updateData = Object.entries(updates || {}).reduce((acc, [key, value]) => {
    if (allowedFields.includes(key) && value !== undefined) {
      acc[key] = value;
    }
    return acc;
  }, {});

  if (Object.keys(updateData).length === 0) {
    return buildError(ERROR_CODES.INVALID_UPDATES, 400);
  }

  const { error } = await supabase.from("sessions").update(updateData).eq("id", sessionId);

  if (error) {
    return { error: error.message, status: 400 };
  }

  return { success: true };
};

export const cancelClubSession = async (sessionId, authId) => {
  if (!authId) {
    return buildError(ERROR_CODES.UNAUTHORIZED, 401);
  }

  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("id, source, club_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) {
    if (sessionError.code === "PGRST116") {
      return buildError(ERROR_CODES.SESSION_NOT_FOUND, 404);
    }
    return { error: sessionError.message, status: 400 };
  }

  if (!session) {
    return buildError(ERROR_CODES.SESSION_NOT_FOUND, 404);
  }

  if (session.source !== "club_created") {
    return buildError(ERROR_CODES.FORBIDDEN, 403);
  }

  const access = await requireActiveAdmin(session.club_id, authId);

  if (!access.allowed) {
    return buildError(access.error, access.status);
  }

  const { error } = await supabase
    .from("sessions")
    .update({ status: "cancelled" })
    .eq("id", sessionId);

  if (error) {
    return { error: error.message, status: 400 };
  }

  return { success: true };
};

export const ERROR_CODES_MAP = ERROR_CODES;
