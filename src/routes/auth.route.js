import { Router } from "express";
import {
  signup,
  login,
  checkUsername,
  resendConfirmationEmail,
  sendPasswordResetEmail,
} from "../controllers/auth.controller.js";

const router = Router();

router.post("/signup", signup);
router.post("/login", login);
router.get("/check-username", checkUsername);
router.post("/resend-confirmation", resendConfirmationEmail);
router.post("/forgot-password", sendPasswordResetEmail);

export default router;
