import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { fetchEloSeries } from "../controllers/stats.controller.js";

const router = Router();

router.get("/elo-series", requireAuth, fetchEloSeries);

export default router;
