import express from "express";
import { signup, login, getMe,refresh,logout,logoutAll,getSessions,revokeSessionById } from "../controllers/authController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.get("/me", authenticate, getMe);
// routes/auth.js
router.post("/signup", signup);
router.post("/login", login);
router.post("/refresh", refresh);
router.post("/logout", logout);

router.get("/me", authenticate, getMe);
router.post("/logout-all", authenticate, logoutAll);
router.get("/sessions", authenticate, getSessions);
router.delete("/sessions/:id", authenticate, revokeSessionById);
export default router;
