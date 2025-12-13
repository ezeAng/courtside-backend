import { supabase } from "../config/supabase.js";

export const findMatch = async (userId, mode) => {
  if (!mode) return { error: "Mode is required", status: 400 };

  const now = new Date().toISOString();

  const { error: queueError } = await supabase
    .from("matchmaking_queue")
    .upsert(
      { auth_id: userId, mode, created_at: now, updated_at: now },
      { onConflict: "auth_id,mode" }
    );

  if (queueError) return { error: queueError.message, status: 400 };

  const { data: opponents, error: searchError } = await supabase
    .from("matchmaking_queue")
    .select("auth_id, mode, created_at")
    .eq("mode", mode)
    .neq("auth_id", userId)
    .order("created_at", { ascending: true })
    .limit(1);

  if (searchError) return { error: searchError.message, status: 400 };

  if (!opponents || opponents.length === 0) {
    return { state: "queued" };
  }

  const opponent = opponents[0];

  const { error: deleteError } = await supabase
    .from("matchmaking_queue")
    .delete()
    .eq("mode", mode)
    .in("auth_id", [userId, opponent.auth_id]);

  if (deleteError) return { error: deleteError.message, status: 400 };

  const { data: opponentProfile } = await supabase
    .from("users")
    .select("auth_id, username, elo")
    .eq("auth_id", opponent.auth_id)
    .single();

  return {
    state: "matched",
    opponent: opponentProfile || { auth_id: opponent.auth_id },
  };
};

export const leaveQueue = async (userId, mode) => {
  if (!mode) return { error: "Mode is required", status: 400 };

  const { error } = await supabase
    .from("matchmaking_queue")
    .delete()
    .eq("auth_id", userId)
    .eq("mode", mode);

  if (error) return { error: error.message, status: 400 };

  return { success: true, state: "left" };
};
