import * as sessionsService from "../services/sessions.service.js";

const getAuthId = (req) => req.authUser?.auth_id || req.authUser?.id || req.user?.auth_id;

export const createSession = async (req, res) => {
  try {
    const hostAuthId = getAuthId(req);

    if (!hostAuthId) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    const result = await sessionsService.createSession(req.body, hostAuthId);

    if (result?.error) {
      const status = result.status || 400;
      return res.status(status).json({ error: result.error });
    }

    return res.status(201).json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const updateSession = async (req, res) => {
  try {
    const hostAuthId = getAuthId(req);
    const { sessionId } = req.params;

    if (!hostAuthId) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    const result = await sessionsService.updateSession(sessionId, hostAuthId, req.body || {});

    if (result?.error) {
      const status = result.status || 400;
      return res.status(status).json({ error: result.error });
    }

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const listSessions = async (req, res) => {
  try {
    const authId = getAuthId(req);
    const result = await sessionsService.listSessions(req.query || {}, authId);

    if (result?.error) {
      const status = result.status || 400;
      return res.status(status).json({ error: result.error });
    }

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const getSessionById = async (req, res) => {
  try {
    const authId = getAuthId(req);
    const { sessionId } = req.params;
    const result = await sessionsService.getSessionDetails(sessionId, authId);

    if (result?.error) {
      const status = result.status || 400;
      return res.status(status).json({ error: result.error });
    }

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const joinSession = async (req, res) => {
  try {
    const authId = getAuthId(req);
    const { sessionId } = req.params;

    if (!authId) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    const result = await sessionsService.joinSession(sessionId, authId);

    if (result?.error) {
      const status = result.status || 400;
      return res.status(status).json({ error: result.error });
    }

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const leaveSession = async (req, res) => {
  try {
    const authId = getAuthId(req);
    const { sessionId } = req.params;

    if (!authId) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    const result = await sessionsService.leaveSession(sessionId, authId);

    if (result?.error) {
      const status = result.status || 400;
      return res.status(status).json({ error: result.error });
    }

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const cancelSession = async (req, res) => {
  try {
    const authId = getAuthId(req);
    const { sessionId } = req.params;

    if (!authId) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    const result = await sessionsService.cancelSession(sessionId, authId);

    if (result?.error) {
      const status = result.status || 400;
      return res.status(status).json({ error: result.error });
    }

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const deleteSession = async (req, res) => {
  try {
    const authId = getAuthId(req);
    const { sessionId } = req.params;

    if (!authId) {
      return res.status(401).json({ error: "UNAUTHORIZED" });
    }

    const result = await sessionsService.deleteSession(sessionId, authId);

    if (result?.error) {
      const status = result.status || 400;
      return res.status(status).json({ error: result.error });
    }

    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
