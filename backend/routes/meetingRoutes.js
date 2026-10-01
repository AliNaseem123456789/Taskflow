import express from "express";
import {
  getMeetings,
  createMeeting,
  getMeeting,
  updateMeeting,
  deleteMeeting,
  respondToMeeting,
  addItem,
  updateItem,
  deleteItem,
  voteItem,
  itemToTask,
  finishMeeting,
  meetingIcs,
} from "../controllers/meetingController.js";
import { authenticate } from "../middleware/auth.js";
import { workspace } from "../middleware/workspace.js";

// login check + the chosen workspace (X-Company-Id header)
const auth = [authenticate, workspace];

const router = express.Router();

router.get("/", auth, getMeetings);
router.post("/", auth, createMeeting);
router.get("/:id", auth, getMeeting);
router.put("/:id", auth, updateMeeting);
router.delete("/:id", auth, deleteMeeting);
router.post("/:id/respond", auth, respondToMeeting);
router.post("/:id/finish", auth, finishMeeting);
router.get("/:id/ics", auth, meetingIcs);

// agenda topics, decisions, action items, retro cards
router.post("/:id/items", auth, addItem);
router.put("/:id/items/:itemId", auth, updateItem);
router.delete("/:id/items/:itemId", auth, deleteItem);
router.post("/:id/items/:itemId/vote", auth, voteItem);
router.post("/:id/items/:itemId/task", auth, itemToTask);

export default router;
