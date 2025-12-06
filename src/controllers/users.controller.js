import { supabase } from "../config/supabase.js";
import * as userService from "../services/users.service.js";

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
    const { query, gender } = req.query;
    const results = await userService.searchUsers(query, gender);

    return res.status(200).json({ results });
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

    const stats = data && data.length > 0 ? data[0] : {};

    return res.json({ success: true, stats });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};

export const getCardData = async (req, res) => {
  try {
    const user_id = req.user.auth_id;

    const { data: user, error: userErr } = await supabase
      .from("users")
      .select("username, gender, region, bio, profile_image_url, elo")
      .eq("auth_id", user_id)
      .single();

    if (userErr) throw userErr;

    const { data: winRateData, error: winErr } = await supabase.rpc(
      "get_win_rate_last10",
      { user_auth_id: user_id }
    );

    if (winErr) throw winErr;

    const { data: bestMatchData, error: bestErr } = await supabase.rpc(
      "get_best_match",
      { user_auth_id: user_id }
    );

    if (bestErr) throw bestErr;

    const { count: totalMatches, error: countErr } = await supabase
      .from("matches")
      .select("*", { count: "exact", head: true })
      .or(`winner_id.eq.${user_id},loser_id.eq.${user_id}`);

    if (countErr) throw countErr;

    const { count: weekMatches, error: weekErr } = await supabase
      .from("matches")
      .select("*", { count: "exact", head: true })
      .or(`winner_id.eq.${user_id},loser_id.eq.${user_id}`)
      .gte(
        "created_at",
        new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()
      );

    if (weekErr) throw weekErr;

    let tier = "Bronze";

    if (user.elo >= 900 && user.elo < 1100) tier = "Silver";
    else if (user.elo >= 1100 && user.elo < 1300) tier = "Gold";
    else if (user.elo >= 1300 && user.elo < 1500) tier = "Platinum";
    else if (user.elo >= 1500) tier = "Diamond";

    const star_rating = Math.max(1, Math.min(5, Math.round(user.elo / 300)));

    const best_match = Array.isArray(bestMatchData)
      ? bestMatchData[0] || null
      : bestMatchData;

    const win_rate_last_10 = Array.isArray(winRateData)
      ? winRateData[0] ?? 0
      : winRateData ?? 0;

    return res.json({
      success: true,
      card: {
        username: user.username,
        gender: user.gender,
        region: user.region,
        bio: user.bio,
        profile_image_url: user.profile_image_url,
        elo: user.elo,
        tier,
        star_rating,
        win_rate_last_10,
        best_match,
        total_matches: totalMatches || 0,
        matches_this_week: weekMatches || 0,
      },
    });
  } catch (err) {
    return res.status(400).json({ success: false, message: err.message });
  }
};
