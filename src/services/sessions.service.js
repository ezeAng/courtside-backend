import { supabase } from "../config/supabase.js";

const ERROR_CODES = {
  SESSION_NOT_FOUND: "SESSION_NOT_FOUND",
  SESSION_FULL: "SESSION_FULL",
  SESSION_CANCELLED: "SESSION_CANCELLED",
  ALREADY_JOINED: "ALREADY_JOINED",
  NOT_A_PARTICIPANT: "NOT_A_PARTICIPANT",
  NOT_HOST: "NOT_HOST",
  UNAUTHORIZED: "UNAUTHORIZED",
  INVALID_CAPACITY: "INVALID_CAPACITY",
  INVALID_UPDATES: "INVALID_UPDATES",
};

const buildError = (code, status = 400) => ({ error: code, status });

const parseBoolean = (value) => value === true || value === "true";
const parseDate = (value) => {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : value;
};
const parseLimit = (value, defaultValue = 5, maxValue = 10) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed)) return defaultValue;
  return Math.min(Math.max(parsed, 1), maxValue);
};

export const createSession = async (sessionInput, hostAuthId) => {
  const requiredFields = [
    "title",
    "description",
    "format",
    "capacity",
    "session_date",
    "session_time",
    "session_end_time",
    "venue_name",
    "hall",
    "court_number",
  ];

  const missingField = requiredFields.find((field) => !sessionInput?.[field]);

  if (missingField) {
    return { error: `Missing field: ${missingField}`, status: 400 };
  }

  const sessionData = {
    ...sessionInput,
    host_auth_id: hostAuthId,
    is_public: true,
    status: "open",
  };

  const { data: insertedSession, error: insertError } = await supabase
    .from("sessions")
    .insert(sessionData)
    .select("id")
    .single();

  if (insertError || !insertedSession) {
    return { error: insertError?.message || "Failed to create session", status: 400 };
  }

  const sessionId = insertedSession.id;

  const { error: participantError } = await supabase.from("session_participants").insert({
    session_id: sessionId,
    user_auth_id: hostAuthId,
    joined_at: new Date().toISOString(),
  });

  if (participantError) {
    await supabase.from("sessions").delete().eq("id", sessionId);
    return { error: participantError.message || "Failed to add host to participants", status: 400 };
  }

  return { success: true, session_id: sessionId };
};

export const listSessions = async (filters, requesterAuthId) => {
  const hostedByMe = parseBoolean(filters.hosted_by_me);
  const joinedByMe = parseBoolean(filters.joined_by_me);
  const availableOnly = parseBoolean(filters.available_only);

  const query = supabase
    .from("sessions")
    .select("*, session_participants:session_participants(user_auth_id)")
    .eq("is_public", true)
    .eq("status", "open")
    .order("session_date", { ascending: true })
    .order("session_time", { ascending: true });

  if (filters.date) {
    query.eq("session_date", filters.date);
  }

  if (filters.from_date && filters.to_date) {
    query.gte("session_date", filters.from_date).lte("session_date", filters.to_date);
  }

  if (filters.format) {
    query.eq("format", filters.format);
  }

  if (filters.venue) {
    query.ilike("venue_name", `%${filters.venue}%`);
  }

  if (hostedByMe && requesterAuthId) {
    query.eq("host_auth_id", requesterAuthId);
  }

  const { data, error } = await query;

  if (error) {
    return { error: error.message, status: 400 };
  }

  let sessions = (data || []).map(({ session_participants, ...rest }) => {
    const participantList = session_participants || [];
    const joined_count = participantList.length;

    return {
      ...rest,
      joined_count,
      _participant_auth_ids: participantList.map((p) => p.user_auth_id),
    };
  });

  if (joinedByMe && requesterAuthId) {
    sessions = sessions.filter((session) => session._participant_auth_ids.includes(requesterAuthId));
  }

  const eloFilterProvided = filters.min_elo !== undefined || filters.max_elo !== undefined;
  let userElo = undefined;

  if (eloFilterProvided) {
    const parsed = Number(filters.min_elo ?? filters.max_elo);
    if (!Number.isNaN(parsed)) {
      userElo = parsed;
    }
  }

  if (eloFilterProvided && userElo !== undefined) {
    sessions = sessions.filter((session) => {
      const minOk = session.min_elo === null || session.min_elo === undefined || session.min_elo <= userElo;
      const maxOk = session.max_elo === null || session.max_elo === undefined || session.max_elo >= userElo;
      return minOk && maxOk;
    });
  }

  if (availableOnly) {
    sessions = sessions.filter((session) => {
      if (typeof session.capacity !== "number") return true;
      return session.joined_count < session.capacity;
    });
  }

  sessions = sessions.map(({ _participant_auth_ids, ...rest }) => rest);

  const filtersApplied = {};

  if (filters.date) filtersApplied.date = filters.date;
  if (filters.from_date && filters.to_date) {
    filtersApplied.from_date = filters.from_date;
    filtersApplied.to_date = filters.to_date;
  }
  if (filters.format) filtersApplied.format = filters.format;
  if (filters.venue) filtersApplied.venue = filters.venue;
  if (eloFilterProvided && userElo !== undefined) {
    filtersApplied.user_elo = userElo;
  }
  if (availableOnly) filtersApplied.available_only = true;
  if (hostedByMe) filtersApplied.hosted_by_me = true;
  if (joinedByMe) filtersApplied.joined_by_me = true;

  return { filters_applied: filtersApplied, sessions };
};

export const listSuggestedSessions = async (filters, requesterAuthId) => {
  if (!requesterAuthId) {
    return buildError(ERROR_CODES.UNAUTHORIZED, 401);
  }

  const limit = parseLimit(filters.limit);
  const today = new Date().toISOString().slice(0, 10);

  const { data: userContext, error: userError } = await supabase
    .from("users")
    .select("overall_elo")
    .eq("auth_id", requesterAuthId)
    .maybeSingle();

  if (userError) {
    return { error: userError.message, status: 400 };
  }

  const { data: sessionsData, error: sessionsError } = await supabase
    .from("sessions")
    .select("*, session_participants(user_auth_id)")
    .eq("is_public", true)
    .eq("status", "open")
    .gte("session_date", today)
    .order("session_date", { ascending: true })
    .order("session_time", { ascending: true });

  if (sessionsError) {
    return { error: sessionsError.message, status: 400 };
  }

  const overallElo = userContext?.overall_elo ?? null;

  const eligibleSessions = (sessionsData || [])
    .map(({ session_participants, ...session }) => {
      const participants = session_participants || [];
      return {
        ...session,
        joined_count: participants.length,
        _participant_auth_ids: participants.map((participant) => participant.user_auth_id),
      };
    })
    .filter((session) => {
      if (session._participant_auth_ids.includes(requesterAuthId)) {
        return false;
      }
      if (typeof session.capacity === "number" && session.joined_count >= session.capacity) {
        return false;
      }
      if (overallElo === null || overallElo === undefined) {
        return session.min_elo === null && session.max_elo === null;
      }
      const minOk = session.min_elo === null || session.min_elo === undefined || session.min_elo <= overallElo;
      const maxOk = session.max_elo === null || session.max_elo === undefined || session.max_elo >= overallElo;
      return minOk && maxOk;
    });

  const sortedSessions = eligibleSessions.sort((a, b) => {
    const aDateTime = `${a.session_date ?? ""}T${a.session_time ?? ""}`;
    const bDateTime = `${b.session_date ?? ""}T${b.session_time ?? ""}`;
    if (aDateTime < bDateTime) return -1;
    if (aDateTime > bDateTime) return 1;

    const aHasRange = a.min_elo !== null && a.min_elo !== undefined && a.max_elo !== null && a.max_elo !== undefined;
    const bHasRange = b.min_elo !== null && b.min_elo !== undefined && b.max_elo !== null && b.max_elo !== undefined;
    if (aHasRange !== bHasRange) return aHasRange ? -1 : 1;

    const aRange = (a.max_elo ?? 99999) - (a.min_elo ?? 0);
    const bRange = (b.max_elo ?? 99999) - (b.min_elo ?? 0);
    if (aRange !== bRange) return aRange - bRange;

    const aRemaining = (a.capacity ?? 0) - a.joined_count;
    const bRemaining = (b.capacity ?? 0) - b.joined_count;
    return aRemaining - bRemaining;
  });

  const suggested_sessions = sortedSessions.slice(0, limit).map(({ _participant_auth_ids, ...session }) => ({
    id: session.id,
    title: session.title,
    format: session.format,
    session_date: session.session_date,
    session_time: session.session_time,
    venue_name: session.venue_name,
    hall: session.hall,
    court_number: session.court_number,
    capacity: session.capacity,
    joined_count: session.joined_count,
    min_elo: session.min_elo,
    max_elo: session.max_elo,
    host_auth_id: session.host_auth_id,
  }));

  return { suggested_sessions };
};

export const listMySessions = async (filters, requesterAuthId) => {
  const includeCancelled = parseBoolean(filters.include_cancelled);
  const fromDate = parseDate(filters.from_date);
  const toDate = parseDate(filters.to_date);

  if (!requesterAuthId) {
    return buildError(ERROR_CODES.UNAUTHORIZED, 401);
  }

  let query = supabase
    .from("sessions")
    .select("*, joined_count:session_participants(count)")
    .order("session_date", { ascending: true })
    .order("session_time", { ascending: true });

  const involvementFilter = `host_auth_id.eq.${requesterAuthId},session_participants.user_auth_id.eq.${requesterAuthId}`;

  query = query.or(involvementFilter, { referencedTable: "session_participants" });

  if (!includeCancelled) {
    query = query.neq("status", "cancelled");
  }

  if (fromDate) {
    query = query.gte("session_date", fromDate);
  }

  if (toDate) {
    query = query.lte("session_date", toDate);
  }

  const { data, error } = await query;

  if (error) {
    return { error: error.message, status: 400 };
  }

  const sessions = (data || []).map(({ joined_count, ...session }) => ({
    ...session,
    joined_count: typeof joined_count === "number" ? joined_count : joined_count?.[0]?.count ?? 0,
  }));

  return { sessions };
};

export const getSessionDetails = async (sessionId, requesterAuthId) => {
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) {
    const isNotFound = sessionError.code === "PGRST116";
    return buildError(ERROR_CODES.SESSION_NOT_FOUND, isNotFound ? 404 : 400);
  }

  if (!session) {
    return buildError(ERROR_CODES.SESSION_NOT_FOUND, 404);
  }

  if (!session.is_public && session.host_auth_id !== requesterAuthId) {
    return buildError(ERROR_CODES.UNAUTHORIZED, 403);
  }

  const { data: participants, error: participantsError } = await supabase
    .from("session_participants")
    .select("user_auth_id, joined_at")
    .eq("session_id", sessionId);

  if (participantsError) {
    return { error: participantsError.message, status: 400 };
  }

  const participantIds = participants?.map((p) => p.user_auth_id) || [];
  let usersMap = new Map();

  if (participantIds.length > 0) {
    const { data: users, error: usersError } = await supabase
      .from("users")
      .select("auth_id, username, overall_elo")
      .in("auth_id", participantIds);

    if (usersError) {
      return { error: usersError.message, status: 400 };
    }

    usersMap = new Map((users || []).map((u) => [u.auth_id, u]));
  }

  const participantsResponse = (participants || []).map((participant) => {
    const user = usersMap.get(participant.user_auth_id) || {};
    return {
      auth_id: participant.user_auth_id,
      username: user.username ?? null,
      overall_elo: user.overall_elo ?? null,
      joined_at: participant.joined_at,
    };
  });

  return {
    session: { ...session, joined_count: participantsResponse.length },
    participants: participantsResponse,
  };
};

export const joinSession = async (sessionId, userAuthId) => {
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) {
    const isNotFound = sessionError.code === "PGRST116";
    return buildError(ERROR_CODES.SESSION_NOT_FOUND, isNotFound ? 404 : 400);
  }

  if (!session) {
    return buildError(ERROR_CODES.SESSION_NOT_FOUND, 404);
  }

  if (!session.is_public) {
    return buildError(ERROR_CODES.UNAUTHORIZED, 403);
  }

  if (session.status === "cancelled") {
    return buildError(ERROR_CODES.SESSION_CANCELLED, 400);
  }

  if (session.status === "full") {
    return buildError(ERROR_CODES.SESSION_FULL, 400);
  }

  const { data: existing, error: existingError } = await supabase
    .from("session_participants")
    .select("id")
    .eq("session_id", sessionId)
    .eq("user_auth_id", userAuthId)
    .maybeSingle();

  if (existingError && existingError.code !== "PGRST116") {
    return { error: existingError.message, status: 400 };
  }

  if (existing) {
    return buildError(ERROR_CODES.ALREADY_JOINED, 400);
  }

  const { count: currentCount, error: countError } = await supabase
    .from("session_participants")
    .select("id", { count: "exact", head: true })
    .eq("session_id", sessionId);

  if (countError) {
    return { error: countError.message, status: 400 };
  }

  if (typeof session.capacity === "number" && currentCount >= session.capacity) {
    await supabase
      .from("sessions")
      .update({ status: "full" })
      .eq("id", sessionId);
    return buildError(ERROR_CODES.SESSION_FULL, 400);
  }

  const { error: insertError } = await supabase.from("session_participants").insert({
    session_id: sessionId,
    user_auth_id: userAuthId,
    joined_at: new Date().toISOString(),
  });

  if (insertError) {
    return { error: insertError.message, status: 400 };
  }

  const finalCount = (currentCount || 0) + 1;
  if (typeof session.capacity === "number" && finalCount >= session.capacity) {
    await supabase
      .from("sessions")
      .update({ status: "full" })
      .eq("id", sessionId);
  }

  return { success: true };
};

export const updateSession = async (sessionId, hostAuthId, updates) => {
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("host_auth_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) {
    const isNotFound = sessionError.code === "PGRST116";
    return buildError(ERROR_CODES.SESSION_NOT_FOUND, isNotFound ? 404 : 400);
  }

  if (!session) {
    return buildError(ERROR_CODES.SESSION_NOT_FOUND, 404);
  }

  if (session.host_auth_id !== hostAuthId) {
    return buildError(ERROR_CODES.NOT_HOST, 403);
  }

  const allowedFields = [
    "title",
    "description",
    "format",
    "capacity",
    "session_date",
    "session_time",
    "session_end_time",
    "venue_name",
    "hall",
    "court_number",
    "is_public",
    "min_elo",
    "max_elo",
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

  if (updateData.capacity !== undefined) {
    const { count: participantCount, error: countError } = await supabase
      .from("session_participants")
      .select("id", { count: "exact", head: true })
      .eq("session_id", sessionId);

    if (countError) {
      return { error: countError.message, status: 400 };
    }

    if (typeof updateData.capacity === "number" && participantCount > updateData.capacity) {
      return buildError(ERROR_CODES.INVALID_CAPACITY, 400);
    }
  }

  const { error: updateError } = await supabase
    .from("sessions")
    .update(updateData)
    .eq("id", sessionId);

  if (updateError) {
    return { error: updateError.message, status: 400 };
  }

  return { success: true };
};

export const leaveSession = async (sessionId, userAuthId) => {
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("*")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) {
    const isNotFound = sessionError.code === "PGRST116";
    return buildError(ERROR_CODES.SESSION_NOT_FOUND, isNotFound ? 404 : 400);
  }

  if (!session) {
    return buildError(ERROR_CODES.SESSION_NOT_FOUND, 404);
  }

  if (session.host_auth_id === userAuthId) {
    return buildError(ERROR_CODES.NOT_HOST, 403);
  }

  const { data: existing, error: existingError } = await supabase
    .from("session_participants")
    .select("id")
    .eq("session_id", sessionId)
    .eq("user_auth_id", userAuthId)
    .maybeSingle();

  if (existingError) {
    if (existingError.code === "PGRST116") {
      return buildError(ERROR_CODES.NOT_A_PARTICIPANT, 400);
    }
    return { error: existingError.message, status: 400 };
  }

  if (!existing) {
    return buildError(ERROR_CODES.NOT_A_PARTICIPANT, 400);
  }

  const { error: deleteError } = await supabase
    .from("session_participants")
    .delete()
    .eq("session_id", sessionId)
    .eq("user_auth_id", userAuthId);

  if (deleteError) {
    return { error: deleteError.message, status: 400 };
  }

  if (session.status === "full") {
    await supabase
      .from("sessions")
      .update({ status: "open" })
      .eq("id", sessionId);
  }

  return { success: true };
};

export const cancelSession = async (sessionId, hostAuthId) => {
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("host_auth_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) {
    const isNotFound = sessionError.code === "PGRST116";
    return buildError(ERROR_CODES.SESSION_NOT_FOUND, isNotFound ? 404 : 400);
  }

  if (!session) {
    return buildError(ERROR_CODES.SESSION_NOT_FOUND, 404);
  }

  if (session.host_auth_id !== hostAuthId) {
    return buildError(ERROR_CODES.NOT_HOST, 403);
  }

  const { error: updateError } = await supabase
    .from("sessions")
    .update({ status: "cancelled" })
    .eq("id", sessionId);

  if (updateError) {
    return { error: updateError.message, status: 400 };
  }

  return { success: true };
};

export const deleteSession = async (sessionId, hostAuthId) => {
  const { data: session, error: sessionError } = await supabase
    .from("sessions")
    .select("host_auth_id")
    .eq("id", sessionId)
    .maybeSingle();

  if (sessionError) {
    const isNotFound = sessionError.code === "PGRST116";
    return buildError(ERROR_CODES.SESSION_NOT_FOUND, isNotFound ? 404 : 400);
  }

  if (!session) {
    return buildError(ERROR_CODES.SESSION_NOT_FOUND, 404);
  }

  if (session.host_auth_id !== hostAuthId) {
    return buildError(ERROR_CODES.NOT_HOST, 403);
  }

  const { error: participantsError } = await supabase
    .from("session_participants")
    .delete()
    .eq("session_id", sessionId);

  if (participantsError) {
    return { error: participantsError.message, status: 400 };
  }

  const { error: deleteError } = await supabase.from("sessions").delete().eq("id", sessionId);

  if (deleteError) {
    return { error: deleteError.message, status: 400 };
  }

  return { success: true };
};

export const ERROR_CODES_MAP = ERROR_CODES;
