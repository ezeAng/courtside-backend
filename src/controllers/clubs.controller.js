import * as clubsService from "../services/clubs.service.js";
import * as clubSessionsService from "../services/clubSessions.service.js";

const getAuthId = (req) => req.authUser?.auth_id || req.authUser?.id || req.user?.auth_id;

export const createClub = async (req, res) => {
  try {
    const authId = getAuthId(req);

    if (!authId) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    const result = await clubsService.createClub(authId, req.body || {});

    if (result?.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.status(201).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const listClubs = async (req, res) => {
  try {
    const result = await clubsService.listPublicClubs();

    if (result?.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const searchClubs = async (req, res) => {
  try {
    const result = await clubsService.searchClubs(req.query?.q);

    if (result?.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const getClubById = async (req, res) => {
  try {
    const authId = getAuthId(req);
    const result = await clubsService.getClubById(req.params.clubId, authId);

    if (result?.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const updateClub = async (req, res) => {
  try {
    const authId = getAuthId(req);

    if (!authId) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    const result = await clubsService.updateClub(req.params.clubId, authId, req.body || {});

    if (result?.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const deleteClub = async (req, res) => {
  try {
    const authId = getAuthId(req);

    if (!authId) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    const result = await clubsService.deleteClub(req.params.clubId, authId);

    if (result?.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const joinClub = async (req, res) => {
  try {
    const authId = getAuthId(req);
    const result = await clubsService.requestOrJoinClub(req.params.clubId, authId);

    if (result?.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const leaveClub = async (req, res) => {
  try {
    const authId = getAuthId(req);
    const result = await clubsService.leaveClub(req.params.clubId, authId);

    if (result?.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const listMyClubs = async (req, res) => {
  try {
    const authId = getAuthId(req);
    const result = await clubsService.listMyClubs(authId);

    if (result?.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const listClubRequests = async (req, res) => {
  try {
    const authId = getAuthId(req);
    const result = await clubsService.listClubRequests(req.params.clubId, authId);

    if (result?.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const approveClubMember = async (req, res) => {
  try {
    const authId = getAuthId(req);
    const { clubId, userId } = req.params;

    const result = await clubsService.approveClubMember(clubId, userId, authId);

    if (result?.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.status(204).send();
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const rejectClubMember = async (req, res) => {
  try {
    const authId = getAuthId(req);
    const { clubId, userId } = req.params;

    const result = await clubsService.rejectClubMember(clubId, userId, authId);

    if (result?.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const removeClubMember = async (req, res) => {
  try {
    const authId = getAuthId(req);
    const { clubId, userId } = req.params;

    const result = await clubsService.removeClubMember(clubId, userId, authId);

    if (result?.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const createClubSession = async (req, res) => {
  try {
    const authId = getAuthId(req);
    const result = await clubSessionsService.createClubSession(
      req.params.clubId,
      authId,
      req.body || {}
    );

    if (result?.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.status(201).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const listClubSessions = async (req, res) => {
  try {
    const authId = getAuthId(req);
    const result = await clubSessionsService.listClubSessions(req.params.clubId, authId);

    if (result?.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const getClubLeague = async (req, res) => {
  try {
    const authId = getAuthId(req);
    const result = await clubsService.getClubLeague(req.params.clubId, authId);

    if (result?.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
