import { Router } from "express";
import {
  getLeaderboard,
  getOverallLeaderboard,
} from "../controllers/leaderboard.controller.js";

const router = Router();

router.get("/overall", getOverallLeaderboard);
// Query params: ?discipline=singles|doubles (default: singles)
router.get("/:gender", getLeaderboard);

export default router;
