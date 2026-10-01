import express from "express";
import { getQuota, recordUsage } from "../controllers/aiController.js";
import { authenticate } from "../middleware/auth.js";
import { workspace } from "../middleware/workspace.js";

// Called by the AI service (/chatbot) with the signed-in person's own token
const auth = [authenticate, workspace];
const router = express.Router();

router.get("/quota", auth, getQuota);
router.post("/usage", auth, recordUsage);

export default router;
