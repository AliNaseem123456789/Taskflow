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
import {
  getInbox,
  addChecklistItem,
  updateChecklistItem,
  deleteChecklistItem,
  addDependency,
  removeDependency,
  addWatcher,
  removeWatcher,
} from "../controllers/taskDetailController.js";
import { getTaskFields, setTaskFields, getTaskApprovals, requestApproval } from "../controllers/workflowController.js";
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
router.get("/inbox", auth, getInbox);

// Task CRUD
router.get("/", auth, getTasks);
router.post("/", auth, addTask);
router.get("/:id", auth, getTask);
// Custom field values and approvals on a task
router.get("/:id/fields", auth, getTaskFields);
router.put("/:id/fields", auth, setTaskFields);
router.get("/:id/approvals", auth, getTaskApprovals);
router.post("/:id/approvals", auth, requestApproval);
router.put("/:id", auth, updateTask);
router.delete("/:id", auth, deleteTask);

// Nested: comments + reactions on a task
router.get("/:taskId/comments", auth, getComments);
router.post("/:taskId/comments", auth, addComment);
router.get("/:taskId/mentionable", auth, getMentionable);
router.delete("/comments/:commentId", auth, deleteComment);
router.post("/:taskId/react", auth, toggleReaction);

// Inside a task: checklist, "blocked by" links, watchers
router.post("/:id/checklist", auth, addChecklistItem);
router.put("/:id/checklist/:itemId", auth, updateChecklistItem);
router.delete("/:id/checklist/:itemId", auth, deleteChecklistItem);
router.post("/:id/dependencies", auth, addDependency);
router.delete("/:id/dependencies/:blockerId", auth, removeDependency);
router.post("/:id/watchers", auth, addWatcher);
router.delete("/:id/watchers/:userId", auth, removeWatcher);

export default router;
