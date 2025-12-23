import * as leaderboardService from "../services/leaderboard.service.js";

export const getLeaderboard = async (req, res) => {
  try {
    const { gender } = req.params;
    const { discipline = "singles" } = req.query;
    const result = await leaderboardService.getLeaderboard(gender, discipline);

    if (result.error) {
      return res.status(400).json(result);
    }

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const getOverallLeaderboard = async (req, res) => {
  try {
    const { limit = 100, offset = 0 } = req.query;
    const result = await leaderboardService.getOverallLeaderboard({
      limit,
      offset,
    });

    if (result.error) {
      return res.status(400).json({ error: result.error });
    }

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
