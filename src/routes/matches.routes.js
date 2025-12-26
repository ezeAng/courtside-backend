import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  createMatch,
  cancelMatch,
  submitMatchScore,
  getH2HRivals,
  getMatchesForUser,
  getMatchById,
  deleteMatch,
  getRecentMatches,
  getPendingMatches,
  confirmMatch,
  rejectMatch,
  addMatchVideoLink,
} from "../controllers/matches.controller.js";

const router = Router();

// CREATE
router.post("/create", requireAuth, createMatch);

// MATCH MANAGEMENT
router.post("/:match_id/cancel", requireAuth, cancelMatch);
router.post("/:match_id/submit-score", requireAuth, submitMatchScore);
router.post("/:matchId/video", requireAuth, addMatchVideoLink);

// READ (specific → generic)
router.get("/pending", requireAuth, getPendingMatches);
router.get("/recent", requireAuth, getRecentMatches);
router.get("/h2h", requireAuth, getH2HRivals);
router.get("/user/:auth_id", getMatchesForUser);
router.get("/:match_id", getMatchById);   // <-- generic, placed LAST among GET routes

// CONFIRM / REJECT (POST)
router.post("/:matchId/confirm", requireAuth, confirmMatch);
router.post("/:matchId/reject", requireAuth, rejectMatch);

// DELETE
router.delete("/:match_id", requireAuth, deleteMatch);


export default router;
