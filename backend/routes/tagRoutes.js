import express from "express";
import { getTags, createTag, deleteTag } from "../controllers/tagController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.get("/", authenticate, getTags);
router.post("/", authenticate, createTag);
router.delete("/:id", authenticate, deleteTag);

export default router;