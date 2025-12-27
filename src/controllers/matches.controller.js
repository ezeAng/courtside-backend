import { supabase } from "../config/supabase.js";
import * as matchesService from "../services/matches.service.js";

export const createMatch = async (req, res) => {
  try {
    const { match_type, players_team_A, players_team_B, winner_team, score, played_at } =
      req.body;
    const submitted_by = req.user?.auth_id || req.authUser?.auth_id;

    const result = await matchesService.createMatch(
      { match_type, players_team_A, players_team_B, winner_team, score, played_at },
      submitted_by
    );

    if (result.error) {
      return res.status(400).json(result);
    }

    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const cancelMatch = async (req, res) => {
  try {
    const userId = req.user?.auth_id || req.authUser?.auth_id;
    const { match_id } = req.params;
    const { reason } = req.body || {};

    const result = await matchesService.cancelMatch(match_id, userId, reason);

    if (result?.error) {
      const status = result.status || 400;
      return res.status(status).json(result);
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const submitMatchScore = async (req, res) => {
  try {
    const userId = req.user?.auth_id || req.authUser?.auth_id;
    const { match_id } = req.params;
    const { score, winner_team } = req.body;

    const result = await matchesService.submitMatchScore(match_id, userId, score, winner_team);

    if (result?.error) {
      const status = result.status || 400;
      return res.status(status).json(result);
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getMatchesForUser = async (req, res) => {
  try {
    const { auth_id } = req.params;
    const result = await matchesService.getMatchesForUser(auth_id);

    if (result?.error) {
      return res.status(400).json(result);
    }

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getMatchById = async (req, res) => {
  try {
    const { match_id } = req.params;
    const result = await matchesService.getMatchById(match_id);

    if (result?.error) {
      const status = result.status || 400;
      return res.status(status).json(result);
    }

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const deleteMatch = async (req, res) => {
  try {
    const { match_id } = req.params;
    const requesterId = req.user?.auth_id || req.authUser?.auth_id;

    const result = await matchesService.deleteMatch(match_id, requesterId);

    if (result?.error) {
      const status = result.status || 400;
      return res.status(status).json(result);
    }

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const editMatch = async (req, res) => {
  try {
    const { match_id } = req.params;
    const requesterId = req.user?.auth_id || req.authUser?.auth_id;
    const { match_type, players_team_A, players_team_B, winner_team, score, played_at } =
      req.body || {};

    const result = await matchesService.editPendingMatch(match_id, requesterId, {
      match_type,
      players_team_A,
      players_team_B,
      winner_team,
      score,
      played_at,
    });

    if (result?.error) {
      const status = result.status || 400;
      return res.status(status).json(result);
    }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getPendingMatches = async (req, res) => {
  try {
    const userId = req.user?.auth_id || req.authUser?.auth_id;
    const result = await matchesService.getPendingMatches(userId);
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message });
  }
};

export const confirmMatch = async (req, res) => {
  try {
    const userId = req.user?.auth_id || req.authUser?.auth_id;
    const { matchId } = req.params;
    const result = await matchesService.confirmMatch(matchId, userId);
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message });
  }
};

export const rejectMatch = async (req, res) => {
  try {
    const userId = req.user?.auth_id || req.authUser?.auth_id;
    const { matchId } = req.params;
    const result = await matchesService.rejectMatch(matchId, userId);
    res.json(result);
  } catch (err) {
    const status = err.status || 500;
    res.status(status).json({ error: err.message });
  }
};

export const getRecentMatches = async (req, res) => {
  try {
    const { data, error } = await supabase.from("recent_matches_view").select("*").limit(20);

    if (error) throw error;

    const matches = (data || []).map((match) => ({
      ...match,
      video_link: match?.video_link || null,
      video_added_at: match?.video_added_at || null,
    }));

    return res.json({ success: true, matches });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

export const getH2HRivals = async (req, res) => {
  try {
    const user_id = req.user.auth_id;

    const { data, error } = await supabase.rpc("get_h2h_rivals", {
      user_auth_id: user_id,
    });

    if (error) throw error;

    return res.json({ success: true, rivals: data });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

export const addMatchVideoLink = async (req, res) => {
  try {
    const authId = req.user?.auth_id || req.authUser?.auth_id;
    const { matchId } = req.params;
    const { video_link } = req.body || {};

    if (!authId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!video_link || typeof video_link !== "string" || !video_link.startsWith("https://")) {
      return res.status(400).json({ error: "Invalid video link" });
    }

    const result = await matchesService.updateMatchVideoLink(matchId, authId, video_link);

    if (result?.error) {
      const status = result.status || 400;
      return res.status(status).json({ error: result.error });
    }

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
