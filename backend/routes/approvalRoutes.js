import express from "express";
import { getApprovals, decideApproval, cancelApproval } from "../controllers/workflowController.js";
import { authenticate } from "../middleware/auth.js";
import { workspace } from "../middleware/workspace.js";

const auth = [authenticate, workspace];
const router = express.Router();

// Approvals asked of me (?box=to_me) or by me (?box=by_me); asking happens on /tasks/:id/approvals
router.get("/", auth, getApprovals);
router.post("/:id/decide", auth, decideApproval);
router.delete("/:id", auth, cancelApproval);

export default router;
