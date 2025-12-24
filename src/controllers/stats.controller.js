import { getEloSeries, ranges } from "../services/stats.service.js";

export const fetchEloSeries = async (req, res) => {
  try {
    const range = req.query.range || "1M";
    const eloType = req.query.elo_type || "overall";
    const tz = req.query.tz || "UTC";
    if (!ranges.includes(range)) {
      return res.status(400).json({ error: "Invalid range" });
    }

    if (!["overall", "singles", "doubles"].includes(eloType)) {
      return res.status(400).json({ error: "Invalid elo type" });
    }

    const authId = req.user?.auth_id;

    if (!authId) {
      return res.status(401).json({ error: "Unauthenticated" });
    }

    const result = await getEloSeries(authId, range, eloType, tz);
    console.log(result)

    if (result?.error) {
      return res.status(500).json({ error: result.error });
    }

    return res.status(200).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
