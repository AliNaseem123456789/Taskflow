import express from "express";
import {
  getRunning, startTimer, stopTimer, getEntries, addEntry, updateEntry, deleteEntry, getTaskTime, getReport,
} from "../controllers/timeController.js";
import { authenticate } from "../middleware/auth.js";
import { workspace } from "../middleware/workspace.js";

const auth = [authenticate, workspace];
const router = express.Router();

// Timer (one running per person)
router.get("/running", auth, getRunning);
router.post("/start", auth, startTimer);
router.post("/stop", auth, stopTimer);

// My entries (timesheet)
router.get("/entries", auth, getEntries);
router.post("/entries", auth, addEntry);
router.put("/entries/:id", auth, updateEntry);
router.delete("/entries/:id", auth, deleteEntry);

// Time on a task, and the company report (?format=csv)
router.get("/tasks/:taskId", auth, getTaskTime);
router.get("/report", auth, getReport);

export default router;
