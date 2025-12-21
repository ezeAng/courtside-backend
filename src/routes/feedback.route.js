import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { submitFeedback } from "../controllers/feedback.controller.js";

const router = Router();

router.post("/feedback", requireAuth, submitFeedback);

export default router;
