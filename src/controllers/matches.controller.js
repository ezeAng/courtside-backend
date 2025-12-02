import * as matchesService from "../services/matches.service.js";

export const createMatch = async (req, res) => {
  try {
    const { match_type, players_team_A, players_team_B, winner_team, score, played_at } =
      req.body;
    const created_by = req.authUser.id;

    const result = await matchesService.createMatch(
      { match_type, players_team_A, players_team_B, winner_team, score, played_at },
      created_by
    );

    if (result.error) {
      return res.status(400).json(result);
    }

    res.status(201).json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getMatchesForUser = async (req, res) => {
  try {
    const { user_id } = req.params;
    const result = await matchesService.getMatchesForUser(user_id);

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
    const requesterId = req.authUser.id;

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
