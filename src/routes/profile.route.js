import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { uploadProfileImage } from "../controllers/profile.controller.js";

const router = Router();

router.post("/upload-avatar", requireAuth, uploadProfileImage);

export default router;
