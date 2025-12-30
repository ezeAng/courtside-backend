import { Router } from "express";
import {
  signup,
  login,
  checkUsername,
  resendConfirmationEmail,
  sendPasswordResetEmail,
  resetPassword,
} from "../controllers/auth.controller.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/signup", signup);
router.post("/login", login);
router.get("/check-username", checkUsername);
router.post("/resend-confirmation", resendConfirmationEmail);
router.post("/forgot-password", sendPasswordResetEmail);
router.post("/reset-password", requireAuth, resetPassword);

export default router;
