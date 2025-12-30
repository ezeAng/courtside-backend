import { supabase } from "../config/supabase.js";
import { getMyOverallRankService } from "../services/stats.service.js";
import * as userService from "../services/users.service.js";
import * as connectionsService from "../services/connections.service.js";

export const getMyProfile = async (req, res) => {
  try {
    const auth_id = req.authUser.id;
    const profile = await userService.getProfile(auth_id);

    res.status(200).json(profile);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getUserContact = async (req, res) => {
  try {
    const requesterAuthId = req.authUser?.auth_id || req.authUser?.id;
    const targetAuthId = req.params?.auth_id;

    const result = await userService.getContactDetailsForConnection(requesterAuthId, targetAuthId);

    if (result?.error) {
      const status = result.status || 400;
      const message = status === 404 ? "User not found" : "Forbidden";
      return res.status(status).json({ error: message });
    }

    return res.status(200).json(result.contact || {});
  } catch (err) {
    return res.status(500).json({ error: "Internal server error" });
  }
};

export const searchUsers = async (req, res) => {
  try {
    const authId = req.authUser?.id || req.authUser?.auth_id;
    const { query, limit } = req.query;
    const results = await connectionsService.searchUsersForConnections(authId, query, { limit });

    return res.status(200).json(results);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const getRecommendedUsers = async (req, res) => {
  try {
    const authId = req.authUser?.id || req.authUser?.auth_id;
    const { mode, region, limit, gender } = req.query;
      
    const result = await connectionsService.getRecommendedUsers(authId, mode, region, {
      limit,
      gender,
    });

    if (result?.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.status(200).json(result);
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

export const updateProfile = async (req, res) => {
  try {
    const authId = req.authUser?.auth_id || req.authUser?.id || req.user?.auth_id;

    if (!authId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const {
      region,
      address,
      bio,
      profile_image_url,
      gender,
      is_profile_private,
      share_contact_with_connections,
      share_contact_with_connection,
      country_code,
    } = req.body || {};

    const updateData = {};
    const assignIfDefined = (key, value) => {
      if (value !== undefined) {
        updateData[key] = value;
      }
    };

    assignIfDefined("region", region);
    assignIfDefined("address", address);
    assignIfDefined("bio", bio);
    assignIfDefined("profile_image_url", profile_image_url);
    assignIfDefined("gender", gender);
    assignIfDefined("is_profile_private", is_profile_private);

    const shareContactValue =
      typeof share_contact_with_connection === "boolean"
        ? share_contact_with_connection
        : share_contact_with_connections;

    if (typeof shareContactValue === "boolean") {
      updateData.share_contact_with_connections = shareContactValue;
    }

    if (country_code !== undefined && country_code !== null) {
      if (typeof country_code !== "string") {
        return res
          .status(400)
          .json({ success: false, message: "country_code must be a string" });
      }

      const normalizedCountry = country_code.trim();
      const isValidCountry = /^[A-Z]{2}$/i.test(normalizedCountry);

      if (!normalizedCountry || !isValidCountry) {
        return res.status(400).json({ success: false, message: "Invalid country_code" });
      }

      updateData.country_code = normalizedCountry.toUpperCase();
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ success: false, message: "No fields to update" });
    }

    const { data, error } = await supabase
      .from("users")
      .update(updateData)
      .eq("auth_id", authId)
      .select()
      .single();

    if (error) {
      if (error.code === "PGRST116" || error.message?.toLowerCase().includes("row not found")) {
        return res.status(404).json({ success: false, message: "User not found" });
      }

      return res.status(500).json({ success: false, message: "Failed to update profile" });
    }

    if (!data) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.json({
      success: true,
      user: data,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: err.message,
    });
  }
};

export const getHomeStats = async (req, res) => {
  try {
    const authId = req.authUser?.auth_id ?? req.user?.auth_id;

    if (!authId) {
      return res.status(400).json({ success: false, message: "Missing authenticated user" });
    }

    const { data, error } = await supabase.rpc("get_home_stats", {
      user_auth_id: authId,
    });

    if (error) throw error;

    return res.json({ success: true, stats: data ?? null });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

export const getCardData = async (req, res) => {
  try {
    const targetAuthId = req.query?.auth_id || req.user?.auth_id;

    if (!targetAuthId) {
      return res.status(400).json({ success: false, message: "Missing target user" });
    }

    // Fetch user profile + ratings (overall/singles/doubles)
    const { data: user, error: userErr } = await supabase
      .from("users")
      .select(
        "username, gender, region, bio, profile_image_url, avatar, singles_elo, doubles_elo, overall_elo"
      )
      .eq("auth_id", targetAuthId)
      .single();
    
    if (userErr) {
      if (userErr.code === "PGRST116") {
        return res.status(404).json({ success: false, message: "User not found" });
      }
      throw userErr;
    }

    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // Win rate from last 10 matches
    const { data: winRate, error: winErr } = await supabase.rpc(
      "get_win_rate_last10",
      { user_auth_id: targetAuthId }
    );
    
    if (winErr) throw winErr;

    // Best match (singles-only assumption)
    const { data: bestMatch, error: bestErr } = await supabase.rpc(
      "get_best_match",
      { user_auth_id: targetAuthId }
    );
    
    if (bestErr) throw bestErr;

    // Total matches played
    const { count: totalMatches, error: totalErr } = await supabase
      .from("match_players")
      .select("*", { count: "exact", head: true })
      .eq("auth_id", targetAuthId);
    if (totalErr) throw totalErr;
    
    // Matches this week
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    
    // const { count: weekMatches, error: weekErr } = await supabase
    //   .from("match_players")
    //   .select("*", { count: "exact", head: true })
    //   .eq("auth_id", targetAuthId)
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
    const authId = req.user?.auth_id;
    const overall = await getMyOverallRankService(authId);

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
