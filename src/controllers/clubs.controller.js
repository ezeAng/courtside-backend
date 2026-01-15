import * as clubsService from "../services/clubs.service.js";
import * as clubSessionsService from "../services/clubSessions.service.js";
import { parseMultipartForm } from "../utils/multipart.js";

const getAuthId = (req) => req.authUser?.auth_id || req.authUser?.id || req.user?.auth_id;

export const createClub = async (req, res) => {
  try {
    const authId = getAuthId(req);

    if (!authId) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    const isMultipart = req.headers["content-type"]?.includes("multipart/form-data");
    let payload = req.body || {};
    let file = null;

    if (isMultipart) {
      const { fields, files } = await parseMultipartForm(req);
      payload = fields || {};
      file = files?.file || null;
    }

    const result = await clubsService.createClub(authId, payload, req.accessToken);

    if (result?.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    if (file && result?.club_id) {
      const uploadResult = await clubsService.updateClubEmblem(
        result.club_id,
        authId,
        file
      );

      if (uploadResult?.error) {
        return res.status(uploadResult.status || 400).json({ error: uploadResult.error });
      }

      return res.status(201).json({ ...result, emblem_url: uploadResult.emblem_url });
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

export const updateClubSession = async (req, res) => {
  try {
    const authId = getAuthId(req);

    if (!authId) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    const result = await clubSessionsService.updateClubSession(
      req.params.sessionId,
      authId,
      req.body || {}
    );

    if (result?.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const cancelClubSession = async (req, res) => {
  try {
    const authId = getAuthId(req);

    if (!authId) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    const result = await clubSessionsService.cancelClubSession(req.params.sessionId, authId);

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

    const isMultipart = req.headers["content-type"]?.includes("multipart/form-data");
    let payload = req.body || {};
    let file = null;

    if (isMultipart) {
      const { fields, files } = await parseMultipartForm(req);
      payload = fields || {};
      file = files?.file || null;
    }

    const hasPayloadUpdates = Object.keys(payload || {}).length > 0;

    if (!hasPayloadUpdates && !file) {
      return res.status(400).json({ error: "INVALID_UPDATES" });
    }

    const result = hasPayloadUpdates
      ? await clubsService.updateClub(req.params.clubId, authId, payload)
      : { success: true };

    if (result?.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    if (file) {
      const uploadResult = await clubsService.updateClubEmblem(
        req.params.clubId,
        authId,
        file
      );

      if (uploadResult?.error) {
        return res.status(uploadResult.status || 400).json({ error: uploadResult.error });
      }

      return res.json({ ...result, emblem_url: uploadResult.emblem_url });
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
    console.log("[clubs][join] request", { clubId: req.params.clubId, authId });
    const result = await clubsService.requestOrJoinClub(req.params.clubId, authId, req.accessToken);

    if (result?.error) {
      console.log("[clubs][join] error", { clubId: req.params.clubId, authId, error: result.error });
      return res.status(result.status || 400).json({ error: result.error });
    }

    console.log("[clubs][join] success", { clubId: req.params.clubId, authId, result });
    return res.json(result);
  } catch (err) {
    console.log("[clubs][join] exception", { clubId: req.params.clubId, error: err.message });
    return res.status(500).json({ error: err.message });
  }
};

export const leaveClub = async (req, res) => {
  try {
    const authId = getAuthId(req);
    console.log("[clubs][leave] request", { clubId: req.params.clubId, authId });
    const result = await clubsService.leaveClub(req.params.clubId, authId);

    if (result?.error) {
      console.log("[clubs][leave] error", { clubId: req.params.clubId, authId, error: result.error });
      return res.status(result.status || 400).json({ error: result.error });
    }

    console.log("[clubs][leave] success", { clubId: req.params.clubId, authId });
    return res.json(result);
  } catch (err) {
    console.log("[clubs][leave] exception", { clubId: req.params.clubId, error: err.message });
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

export const listClubMembers = async (req, res) => {
  try {
    const authId = getAuthId(req);
    const result = await clubsService.listClubMembers(req.params.clubId, authId);

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

    const result = await clubsService.approveClubMember(clubId, userId, authId, req.accessToken);

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
