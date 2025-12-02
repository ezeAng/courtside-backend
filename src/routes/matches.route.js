import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  createMatch,
  getMatchesForUser,
  getMatchById,
  deleteMatch,
} from "../controllers/matches.controller.js";

const router = Router();

router.post("/create", requireAuth, createMatch);
router.get("/user/:user_id", getMatchesForUser);
router.get("/:match_id", getMatchById);
router.delete("/:match_id", requireAuth, deleteMatch);

export default router;
