import * as authService from "../services/auth.service.js";

export const signup = async (req, res) => {
  try {
    const { email, username, password, gender } = req.body;
    const result = await authService.signup(email, username, password, gender);

    if (result.error) {
      return res.status(400).json(result);
    }

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const login = async (req, res) => {
  try {
    const { email, username, password } = req.body;
    const identifier = email || username;
    const result = await authService.login(identifier, password);

    if (result.error) {
      return res.status(400).json(result);
    }

    res.status(200).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const checkUsername = async (req, res) => {
  try {
    const { username } = req.query;
    const result = await authService.checkUsername(username);

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
