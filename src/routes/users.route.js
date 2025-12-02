import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  getMyProfile,
  searchUsers,
  updateMyProfile,
} from "../controllers/users.controller.js";

const router = Router();

router.get("/me", requireAuth, getMyProfile);
router.put("/me", requireAuth, updateMyProfile);
router.get("/search", searchUsers);

export default router;
