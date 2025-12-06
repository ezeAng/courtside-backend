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
