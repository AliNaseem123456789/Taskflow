import express from "express";
import {
  getMyTeams,
  createTeam,
  getTeam,
  joinTeam,
  leaveTeam,
  removeMember,
  updateMemberRole,
  regenerateInvite,
  deleteTeam,
  getTeamFeed,
  getTeamStats,
  sendTeamDigest,
} from "../controllers/teamController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.get("/", authenticate, getMyTeams);
router.post("/", authenticate, createTeam);
router.post("/join", authenticate, joinTeam);
router.get("/:id", authenticate, getTeam);
router.delete("/:id", authenticate, deleteTeam);
router.post("/:id/leave", authenticate, leaveTeam);
router.delete("/:id/members/:userId", authenticate, removeMember);
router.put("/:id/members/:userId/role", authenticate, updateMemberRole);
router.post("/:id/regenerate-invite", authenticate, regenerateInvite);
router.get("/:id/feed", authenticate, getTeamFeed);
router.get("/:id/stats", authenticate, getTeamStats);
router.post("/:id/digest", authenticate, sendTeamDigest);

export default router;