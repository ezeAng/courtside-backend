import { supabase } from "../config/supabase.js";

const validateField = (value, min, max) => {
  if (typeof value !== "string") return null;

  const trimmed = value.trim();

  if (trimmed.length < min || trimmed.length > max) return null;

  return trimmed;
};

export const submitFeedback = async (req, res) => {
  try {
    const subject = validateField(req.body?.subject, 1, 50);
    const text = validateField(req.body?.text, 1, 1000);

    if (!subject) {
      return res
        .status(400)
        .json({ error: "Subject must be between 1 and 50 characters" });
    }

    if (!text) {
      return res
        .status(400)
        .json({ error: "Text must be between 1 and 1000 characters" });
    }

    const authId = req.user?.auth_id;

    if (!authId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    const { data, error } = await supabase
      .from("feedback")
      .insert({ auth_id: authId, subject, text })
      .select("id, status, created_at")
      .single();

    if (error) {
      console.error("Failed to submit feedback:", error);
      return res.status(500).json({ error: "Failed to submit feedback" });
    }

    return res.status(201).json({ feedback: data });
  } catch (err) {
    console.error("Unexpected error submitting feedback:", err);
    return res.status(500).json({ error: "Failed to submit feedback" });
  }
};
