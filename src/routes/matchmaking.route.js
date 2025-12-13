import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { findMatch, leaveQueue } from "../controllers/matchmaking.controller.js";

const router = Router();

router.post("/find", requireAuth, findMatch);
router.post("/leave", requireAuth, leaveQueue);

export default router;
