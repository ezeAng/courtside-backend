import * as connectionsService from "../services/connections.service.js";

const getAuthId = (req) => req.authUser?.id || req.authUser?.auth_id;

export const sendConnectionRequest = async (req, res) => {
  try {
    const authId = getAuthId(req);
    const { receiver_auth_id } = req.body || {};

    const result = await connectionsService.sendConnectionRequest(authId, receiver_auth_id);

    if (result?.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const cancelConnectionRequest = async (req, res) => {
  try {
    const authId = getAuthId(req);
    const { request_id } = req.body || {};

    const result = await connectionsService.cancelConnectionRequest(authId, request_id);

    if (result?.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const acceptConnectionRequest = async (req, res) => {
  try {
    const authId = getAuthId(req);
    const { request_id } = req.body || {};

    const result = await connectionsService.acceptConnectionRequest(authId, request_id);

    if (result?.error) {
      return res.status(result.status || 400).json({ error: result.error });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const listIncomingRequests = async (req, res) => {
  try {
    const authId = getAuthId(req);
    const results = await connectionsService.listIncomingRequests(authId);
    return res.status(200).json(results);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const listOutgoingRequests = async (req, res) => {
  try {
    const authId = getAuthId(req);
    const results = await connectionsService.listOutgoingRequests(authId);
    return res.status(200).json(results);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

export const listConnections = async (req, res) => {
  try {
    const authId = getAuthId(req);
    const results = await connectionsService.listConnections(authId);

    return res.status(200).json(results);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};

