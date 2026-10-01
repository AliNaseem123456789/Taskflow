import express from "express";
import { getDecisions, createDecision, updateDecision, deleteDecision } from "../controllers/knowledgeController.js";
import { authenticate } from "../middleware/auth.js";
import { workspace } from "../middleware/workspace.js";

const auth = [authenticate, workspace];
const router = express.Router();

// Decision log of the chosen company
router.get("/", auth, getDecisions);
router.post("/", auth, createDecision);
router.put("/:id", auth, updateDecision);
router.delete("/:id", auth, deleteDecision);

export default router;
