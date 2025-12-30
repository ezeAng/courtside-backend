import { supabase } from "../config/supabase.js";

export const requireAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) return res.status(401).json({ error: "Missing auth token" });

    const decodeTokenPayload = (jwtToken) => {
      const [_, payload] = jwtToken.split(".");
      if (!payload) return null;

      try {
        const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
        return decoded;
      } catch (err) {
        return null;
      }
    };

    const decoded = decodeTokenPayload(token);

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    const authUser = {
      ...data.user,
      auth_id: decoded?.sub || data.user.id,
    };

    req.authUser = authUser;
    req.user = { ...authUser, auth_id: authUser.auth_id };
    req.accessToken = token;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
