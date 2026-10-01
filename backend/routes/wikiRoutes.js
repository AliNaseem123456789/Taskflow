import express from "express";
import {
  getWikiPages,
  getWikiPage,
  createWikiPage,
  updateWikiPage,
  getWikiVersion,
  deleteWikiPage,
} from "../controllers/knowledgeController.js";
import { authenticate } from "../middleware/auth.js";
import { workspace } from "../middleware/workspace.js";

const auth = [authenticate, workspace];
const router = express.Router();

// Wiki pages of the chosen company (company-wide or per team)
router.get("/", auth, getWikiPages);
router.post("/", auth, createWikiPage);
router.get("/:id", auth, getWikiPage);
router.put("/:id", auth, updateWikiPage);
router.delete("/:id", auth, deleteWikiPage);
router.get("/:id/versions/:versionId", auth, getWikiVersion);

export default router;
