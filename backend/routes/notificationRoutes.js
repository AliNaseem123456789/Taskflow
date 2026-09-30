import express from "express";
import { getNotifications, markRead, markAllRead } from "../controllers/notificationController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.get("/", authenticate, getNotifications);
router.post("/read-all", authenticate, markAllRead);
router.put("/:id/read", authenticate, markRead);

export default router;
