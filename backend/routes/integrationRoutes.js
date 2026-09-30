import express from "express";
import {
  getIntegrations,
  updateContact,
  sendTest,
  getPushKey,
  subscribePush,
  unsubscribePush,
  googleConnect,
  googleCallback,
  googleSyncNow,
  googleDisconnect,
  connectGithub,
  connectJira,
  syncNow,
  disconnect,
} from "../controllers/integrationController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.get("/", authenticate, getIntegrations);
router.put("/contact", authenticate, updateContact);
router.post("/test", authenticate, sendTest);

// Browser push
router.get("/push/key", authenticate, getPushKey);
router.post("/push/subscribe", authenticate, subscribePush);
router.delete("/push/subscribe", authenticate, unsubscribePush);

// Google Calendar (callback is opened by Google, so no login header)
router.get("/google/connect", authenticate, googleConnect);
router.get("/google/callback", googleCallback);
router.post("/google/sync", authenticate, googleSyncNow);
router.delete("/google", authenticate, googleDisconnect);

// GitHub / Jira import
router.put("/github", authenticate, connectGithub);
router.put("/jira", authenticate, connectJira);
router.post("/github/sync", authenticate, syncNow("github"));
router.post("/jira/sync", authenticate, syncNow("jira"));
router.delete("/github", authenticate, disconnect("github"));
router.delete("/jira", authenticate, disconnect("jira"));

export default router;
