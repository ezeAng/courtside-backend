import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  getMyProfile,
  getHomeStats,
  getCardData,
  deleteMyAccount,
  listOtherUsers,
  getMyOverallRank,
  getUserProfileByUsername,
  searchUsernames,
  searchUsers,
  updateProfile,
} from "../controllers/users.controller.js";

const router = Router();

router.get("/me", requireAuth, getMyProfile);
router.get("/home-stats", requireAuth, getHomeStats);
router.get("/me/overall-rank", requireAuth, getMyOverallRank);
router.get("/card-data", requireAuth, getCardData);
router.put("/me", requireAuth, updateProfile);
router.delete("/me", requireAuth, deleteMyAccount);
router.get("/search/autocomplete", requireAuth, searchUsernames);
router.get("/search/profile", requireAuth, getUserProfileByUsername);
router.get("/search", searchUsers);
router.get("/others", requireAuth, listOtherUsers);

export default router;
