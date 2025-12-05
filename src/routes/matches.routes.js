import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  createMatch,
  getMatchesForUser,
  getMatchById,
  deleteMatch,
  getPendingMatches,
  confirmMatch,
  rejectMatch,
} from "../controllers/matches.controller.js";

const router = Router();

router.post("/matches/create", requireAuth, createMatch);
router.get("/matches/user/:user_id", getMatchesForUser);
router.get("/matches/:match_id", getMatchById);
router.delete("/matches/:match_id", requireAuth, deleteMatch);
router.get("/matches/pending", requireAuth, getPendingMatches);
router.post("/matches/:matchId/confirm", requireAuth, confirmMatch);
router.post("/matches/:matchId/reject", requireAuth, rejectMatch);

export default router;
