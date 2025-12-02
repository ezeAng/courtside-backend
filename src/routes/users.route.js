import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getMyProfile, updateMyProfile } from "../controllers/users.controller.js";

const router = Router();

router.get("/me", requireAuth, getMyProfile);
router.put("/me", requireAuth, updateMyProfile);

export default router;
