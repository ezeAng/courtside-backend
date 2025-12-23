import { supabase } from "../config/supabase.js";
import * as userService from "../services/users.service.js";
import { getMyOverallRank as getMyOverallRankService } from "../services/stats.service.js";

export const getMyProfile = async (req, res) => {
  try {
    const auth_id = req.authUser.id;
    const profile = await userService.getProfile(auth_id);

    res.status(200).json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const searchUsers = async (req, res) => {
  try {
    const { query, gender, limit, page, discipline } = req.query;
    const results = await userService.searchUsers(query, gender, { limit, page, discipline });

    if (results?.error) {
      return res.status(400).json(results);
    }

    return res.status(200).json(results);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const searchUsernames = async (req, res) => {
  try {
    const { query, limit } = req.query;
    const authId = req.authUser?.auth_id || req.authUser?.id;

    const results = await userService.searchUsernames(query, { limit, excludeAuthId: authId });

    return res.status(200).json(results);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const getUserProfileByUsername = async (req, res) => {
  try {
    const { username } = req.query;
    const result = await userService.getUserProfileWithStats(username);

    if (result?.error) {
      const status = result.status || 400;
      return res.status(status).json({ error: result.error });
    }

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const listOtherUsers = async (req, res) => {
  try {
    const auth_id = req.authUser.id;
    const results = await userService.listOtherUsers(auth_id);

    return res.status(200).json({ results });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const updateMyProfile = async (req, res) => {
  try {
    const auth_id = req.authUser.id;
    const { username, gender, avatar } = req.body;

    const updates = { username, gender, avatar };

    const result = await userService.updateUserService(auth_id, updates);

    if (result.error) {
      return res.status(400).json(result);
    }

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const updateProfile = async (req, res) => {
  try {
    const user_id = req.user.auth_id;

    const { region, address, bio, profile_image_url } = req.body;

    const { data, error } = await supabase
      .from("users")
      .update({
        region,
        address,
        bio,
        profile_image_url,
      })
      .eq("auth_id", user_id)
      .select()
      .single();

    if (error) throw error;

    return res.json({
      success: true,
      user: data,
    });
  } catch (err) {
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }
};

export const getHomeStats = async (req, res) => {
  try {
    const user_id = req.user.auth_id;

    const { data, error } = await supabase.rpc("get_home_stats", {
      user_auth_id: user_id,
    });

    if (error) throw error;

    const overallResult = await getMyOverallRankService();

    if (overallResult?.error) throw new Error(overallResult.error);

    const stats = data ?? {};
    const overall = overallResult && !overallResult.error ? overallResult : null;

    stats.overall = {
      overall_elo: overall?.overall_elo ?? null,
      rank: overall?.overall_rank ?? null,
    };

    return res.json({ success: true, stats });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

export const getCardData = async (req, res) => {
  try {
    const user_id = req.user.auth_id;
    // Fetch user profile + ratings (overall/singles/doubles)
    const { data: user, error: userErr } = await supabase
      .from("users")
      .select(
        "username, gender, region, bio, profile_image_url, avatar, singles_elo, doubles_elo, overall_elo"
      )
      .eq("auth_id", user_id)
      .single();
    
    if (userErr) throw userErr;

    // Win rate from last 10 matches
    const { data: winRate, error: winErr } = await supabase.rpc(
      "get_win_rate_last10",
      { user_auth_id: user_id }
    );
    
    if (winErr) throw winErr;

    // Best match (singles-only assumption)
    const { data: bestMatch, error: bestErr } = await supabase.rpc(
      "get_best_match",
      { user_auth_id: user_id }
    );
    
    if (bestErr) throw bestErr;

    // Total matches played
    const { count: totalMatches, error: totalErr } = await supabase
      .from("match_players")
      .select("*", { count: "exact", head: true })
      .eq("auth_id", user_id);
    if (totalErr) throw totalErr;
    
    // Matches this week
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    // const { count: weekMatches, error: weekErr } = await supabase
    //   .from("match_players")
    //   .select("*", { count: "exact", head: true })
    //   .eq("auth_id", user_id)
    //   .gte("created_at", oneWeekAgo); // no such field
    
    // if (weekErr) throw weekErr;
    var weekMatches = 0;
    
    // Tier calculation

    const displayElo = user.overall_elo ?? user.singles_elo ?? 0;
    let tier = "Bronze";
    if (displayElo >= 900 && displayElo < 1100) tier = "Silver";
    if (displayElo >= 1100 && displayElo < 1300) tier = "Gold";
    if (displayElo >= 1300 && displayElo < 1500) tier = "Platinum";
    if (displayElo >= 1500) tier = "Diamond";
    
    // Star rating (1–5)
    let star_rating = Math.max(1, Math.min(5, Math.round(displayElo / 300)));
    
    const result = {
      success: true,
      card: {
        username: user.username,
        gender: user.gender,
        region: user.region,
        bio: user.bio,
        profile_image_url: user.profile_image_url,
        avatar: user.avatar,
        singles_elo: user.singles_elo,
        doubles_elo: user.doubles_elo,
        overall_elo: user.overall_elo,
        tier,
        star_rating,
        win_rate_last_10: winRate ?? 0,
        best_match: bestMatch && bestMatch.length > 0 ? bestMatch[0] : null,
        total_matches: totalMatches || 0,
        matches_this_week: weekMatches || 0,
      },
    }
    return res.json(result);
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

export const deleteMyAccount = async (req, res) => {
  try {
    const authId = req.authUser?.auth_id || req.authUser?.id;

    if (!authId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const result = await userService.deleteUserAndData(authId);

    if (!result.success) {
      return res.status(400).json({ success: false, errors: result.errors });
    }

    return res.status(200).json({ success: true, message: "Account deleted" });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const getMyOverallRank = async (req, res) => {
  try {
    const overall = await getMyOverallRankService();

    if (overall?.error) {
      throw new Error(overall.error);
    }

    if (!overall) {
      return res.json({
        overall_rank: null,
        overall_elo: null,
        message: "Overall ranking unlocks after 5 matches",
      });
    }

    return res.json(overall);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
};
