import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  createSession,
  listSessions,
  getSessionById,
  joinSession,
  leaveSession,
  cancelSession,
} from "../controllers/sessions.controller.js";

const router = Router();

router.post("/sessions", requireAuth, createSession);
router.get("/sessions", requireAuth, listSessions);
router.get("/sessions/:sessionId", requireAuth, getSessionById);
router.post("/sessions/:sessionId/join", requireAuth, joinSession);
router.post("/sessions/:sessionId/leave", requireAuth, leaveSession);
router.post("/sessions/:sessionId/cancel", requireAuth, cancelSession);

export default router;
