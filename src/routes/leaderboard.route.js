import { Router } from "express";
import { getLeaderboard } from "../controllers/leaderboard.controller.js";

const router = Router();

// Query params: ?discipline=singles|doubles (default: singles)
router.get("/:gender", getLeaderboard);

export default router;
