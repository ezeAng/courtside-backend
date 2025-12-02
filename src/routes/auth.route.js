import { Router } from "express";
import { signup, login, checkUsername } from "../controllers/auth.controller.js";

const router = Router();

router.post("/signup", signup);
router.post("/login", login);
router.get("/check-username", checkUsername);

export default router;
