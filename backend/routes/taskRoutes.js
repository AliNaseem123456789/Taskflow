import express from "express";
import { getTasks, addTask, updateTask, deleteTask, searchTasks, getStreak } from "../controllers/taskController.js";
import { getComments, addComment, deleteComment, toggleReaction } from "../controllers/commentController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

// Named routes first (before /:id to avoid param conflicts)
router.get("/search", authenticate, searchTasks);
router.get("/streak", authenticate, getStreak);

// Task CRUD
router.get("/", authenticate, getTasks);
router.post("/", authenticate, addTask);
router.put("/:id", authenticate, updateTask);
router.delete("/:id", authenticate, deleteTask);

// Nested: comments + reactions on a task
router.get("/:taskId/comments", authenticate, getComments);
router.post("/:taskId/comments", authenticate, addComment);
router.delete("/comments/:commentId", authenticate, deleteComment);
router.post("/:taskId/react", authenticate, toggleReaction);

export default router;