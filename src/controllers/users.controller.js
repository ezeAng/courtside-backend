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

export const updateMyProfile = async (req, res) => {
  try {
    const auth_id = req.authUser.id;
    const updates = req.body;

    const result = await userService.updateProfile(auth_id, updates);

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
