import express from "express";
import {
  signup,
  login,
  getMe,
  updateMe,
  changePassword,
  forgotPassword,
  resetPassword,
  resendVerification,
  verifyEmail,
  refresh,
  logout,
  logoutAll,
  getSessions,
  revokeSessionById,
} from "../controllers/authController.js";
import { authenticate, optionalAuthenticate } from "../middleware/auth.js";

const router = express.Router();

router.post("/signup", signup);
router.post("/login", login);
router.post("/refresh", refresh);
router.post("/logout", optionalAuthenticate, logout);

// password reset + email verification (links come by email)
router.post("/forgot-password", forgotPassword);
router.post("/reset-password", resetPassword);
router.post("/verify-email", verifyEmail);
router.post("/send-verification", authenticate, resendVerification);

router.get("/me", authenticate, getMe);
router.put("/me", authenticate, updateMe);
router.post("/change-password", authenticate, changePassword);
router.post("/logout-all", authenticate, logoutAll);
router.get("/sessions", authenticate, getSessions);
router.delete("/sessions/:id", authenticate, revokeSessionById);

export default router;
