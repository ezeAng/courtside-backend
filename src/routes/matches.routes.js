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

// CREATE
router.post("/create", requireAuth, createMatch);

// READ (specific → generic)
router.get("/pending", requireAuth, getPendingMatches);
router.get("/user/:auth_id", getMatchesForUser);
router.get("/:match_id", getMatchById);   // <-- generic, placed LAST among GET routes

// CONFIRM / REJECT (POST)
router.post("/:matchId/confirm", requireAuth, confirmMatch);
router.post("/:matchId/reject", requireAuth, rejectMatch);

// DELETE
router.delete("/:match_id", requireAuth, deleteMatch);


export default router;
