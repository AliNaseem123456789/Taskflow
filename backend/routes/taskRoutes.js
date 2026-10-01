import express from "express";
import {
  getTasks,
  getTask,
  addTask,
  updateTask,
  deleteTask,
  searchTasks,
  getStreak,
  getHeatmap,
  reorderTasks,
} from "../controllers/taskController.js";
import {
  getComments,
  addComment,
  deleteComment,
  toggleReaction,
  getMentionable,
} from "../controllers/commentController.js";
import { authenticate } from "../middleware/auth.js";
import { workspace } from "../middleware/workspace.js";

// login check + the chosen workspace (X-Company-Id header)
const auth = [authenticate, workspace];

const router = express.Router();

// Named routes first (before /:id to avoid param conflicts)
router.get("/search", auth, searchTasks);
router.get("/streak", auth, getStreak);
router.get("/heatmap", auth, getHeatmap);
router.put("/reorder", auth, reorderTasks);

// Task CRUD
router.get("/", auth, getTasks);
router.post("/", auth, addTask);
router.get("/:id", auth, getTask);
router.put("/:id", auth, updateTask);
router.delete("/:id", auth, deleteTask);

// Nested: comments + reactions on a task
router.get("/:taskId/comments", auth, getComments);
router.post("/:taskId/comments", auth, addComment);
router.get("/:taskId/mentionable", auth, getMentionable);
router.delete("/comments/:commentId", auth, deleteComment);
router.post("/:taskId/react", auth, toggleReaction);

export default router;
