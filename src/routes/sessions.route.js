import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  createSession,
  listSessions,
  listSuggested,
  listMine,
  listUpcomingReminders,
  getSessionById,
  joinSession,
  leaveSession,
  cancelSession,
  updateSession,
  deleteSession,
} from "../controllers/sessions.controller.js";

const router = Router();

router.post("/sessions", requireAuth, createSession);
router.get("/sessions", requireAuth, listSessions);
router.get("/sessions/suggested", requireAuth, listSuggested);
router.get("/sessions/mine", requireAuth, listMine);
router.get("/sessions/reminders/upcoming", requireAuth, listUpcomingReminders);
router.get("/sessions/:sessionId", requireAuth, getSessionById);
router.put("/sessions/:sessionId", requireAuth, updateSession);
router.post("/sessions/:sessionId/join", requireAuth, joinSession);
router.post("/sessions/:sessionId/leave", requireAuth, leaveSession);
router.post("/sessions/:sessionId/cancel", requireAuth, cancelSession);
router.delete("/sessions/:sessionId", requireAuth, deleteSession);

export default router;
