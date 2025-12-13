import * as matchmakingService from "../services/matchmaking.service.js";

export const findMatch = async (req, res) => {
  try {
    const userId = req.user?.auth_id || req.authUser?.auth_id;
    const { mode } = req.body;

    const result = await matchmakingService.findMatch(userId, mode);

    if (result?.error) {
      const status = result.status || 400;
      return res.status(status).json(result);
    }

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const leaveQueue = async (req, res) => {
  try {
    const userId = req.user?.auth_id || req.authUser?.auth_id;
    const { mode } = req.body;

    const result = await matchmakingService.leaveQueue(userId, mode);

    if (result?.error) {
      const status = result.status || 400;
      return res.status(status).json(result);
    }

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
