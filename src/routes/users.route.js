import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  getMyProfile,
  getHomeStats,
  getCardData,
  listOtherUsers,
  searchUsers,
  updateMyProfile,
  updateProfile,
} from "../controllers/users.controller.js";

const router = Router();

router.get("/me", requireAuth, getMyProfile);
router.get("/home-stats", requireAuth, getHomeStats);
router.get("/card-data", requireAuth, getCardData);
router.put("/update", requireAuth, updateMyProfile);
router.put("/me", requireAuth, updateProfile);
router.get("/search", searchUsers);
router.get("/others", requireAuth, listOtherUsers);

export default router;
