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

const toDatePart = (value) => {
  if (!value) return null;
  if (typeof value === "string") {
    if (value.includes("T")) {
      return value.split("T")[0];
    }
    if (value.match(/^\d{4}-\d{2}-\d{2}$/)) {
      return value;
    }
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(0, 10);
};

const toTimePart = (value) => {
  if (!value) return null;
  if (typeof value === "string") {
    if (value.includes("T")) {
      const timePart = value.split("T")[1];
      if (!timePart) return null;
      return timePart.replace("Z", "").split(".")[0];
    }
    if (value.match(/^\d{2}:\d{2}(:\d{2})?$/)) {
      return value.length === 5 ? `${value}:00` : value;
    }
  }
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString().slice(11, 19);
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
    session_type: "club",
    title: payload?.title,
    description: payload?.description ?? null,
    format: payload?.format ?? null,
    is_public: payload?.is_public ?? true,
    session_date: payload?.session_date ?? toDatePart(payload?.start_time),
    session_time: payload?.session_time ?? toTimePart(payload?.start_time),
    session_end_time: payload?.session_end_time ?? toTimePart(payload?.end_time),
    venue_name: payload?.venue_name ?? payload?.venue ?? null,
    hall: payload?.hall ?? null,
    court_number: payload?.court_number ?? null,
    min_elo: payload?.min_elo ?? null,
    max_elo: payload?.max_elo ?? null,
    capacity: payload?.capacity,
    status: "open",
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
    .select(
      "id, title, description, is_public, format, capacity, session_date, session_time, session_end_time, venue_name, hall, court_number, min_elo, max_elo, status, session_type, club_id, source"
    )
    .eq("club_id", clubId)
    .eq("source", "club_created")
    .order("session_date", { ascending: true })
    .order("session_time", { ascending: true });

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

  const fieldMap = {
    title: "title",
    description: "description",
    format: "format",
    is_public: "is_public",
    capacity: "capacity",
    session_date: "session_date",
    session_time: "session_time",
    session_end_time: "session_end_time",
    venue_name: "venue_name",
    hall: "hall",
    court_number: "court_number",
    min_elo: "min_elo",
    max_elo: "max_elo",
    start_time: "start_time",
    end_time: "end_time",
    venue: "venue",
  };

  const updateData = Object.entries(updates || {}).reduce((acc, [key, value]) => {
    if (value === undefined) return acc;

    if (key === "start_time") {
      const datePart = toDatePart(value);
      const timePart = toTimePart(value);
      if (datePart) acc.session_date = datePart;
      if (timePart) acc.session_time = timePart;
      return acc;
    }

    if (key === "end_time") {
      const timePart = toTimePart(value);
      if (timePart) acc.session_end_time = timePart;
      return acc;
    }

    if (key === "venue") {
      acc.venue_name = value;
      return acc;
    }

    const mapped = fieldMap[key];
    if (mapped) {
      acc[mapped] = value;
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
