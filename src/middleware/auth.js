import { supabase } from "../config/supabase.js";

export const requireAuth = async (req, res, next) => {
  try {
    const token = req.headers.authorization?.replace("Bearer ", "");

    if (!token) return res.status(401).json({ error: "Missing auth token" });

    const { data, error } = await supabase.auth.getUser(token);

    if (error || !data?.user) {
      return res.status(401).json({ error: "Invalid or expired token" });
    }

    req.authUser = data.user; // contains auth_id
    req.user = data.user;
    next();
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
