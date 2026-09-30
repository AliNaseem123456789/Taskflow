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
  updateDigestSettings,
  createInvite,
  getInvites,
  revokeInvite,
  lookupInvite,
  acceptInvite,
} from "../controllers/teamController.js";
import {
  getMyProjects,
  getProjects,
  createProject,
  updateProject,
  deleteProject,
  getProjectTasks,
  getTeamGoals,
  createTeamGoal,
  deleteTeamGoal,
} from "../controllers/projectController.js";
import { getStandups, getStandupDraft, saveStandup } from "../controllers/standupController.js";
import { setTeamSlack } from "../controllers/integrationController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.get("/", authenticate, getMyTeams);
router.post("/", authenticate, createTeam);
router.post("/join", authenticate, joinTeam);

// Named routes first (before /:id)
router.get("/projects/mine", authenticate, getMyProjects);
router.get("/invites/lookup", authenticate, lookupInvite);
router.post("/invites/accept", authenticate, acceptInvite);

router.get("/:id", authenticate, getTeam);
router.delete("/:id", authenticate, deleteTeam);
router.post("/:id/leave", authenticate, leaveTeam);
router.delete("/:id/members/:userId", authenticate, removeMember);
router.put("/:id/members/:userId/role", authenticate, updateMemberRole);
router.post("/:id/regenerate-invite", authenticate, regenerateInvite);
router.get("/:id/feed", authenticate, getTeamFeed);
router.get("/:id/stats", authenticate, getTeamStats);

// Digest
router.post("/:id/digest", authenticate, sendTeamDigest);
router.put("/:id/digest-settings", authenticate, updateDigestSettings);
router.put("/:id/slack", authenticate, setTeamSlack);

// Email invites
router.get("/:id/invites", authenticate, getInvites);
router.post("/:id/invites", authenticate, createInvite);
router.delete("/:id/invites/:inviteId", authenticate, revokeInvite);

// Projects
router.get("/:id/projects", authenticate, getProjects);
router.post("/:id/projects", authenticate, createProject);
router.put("/:id/projects/:projectId", authenticate, updateProject);
router.delete("/:id/projects/:projectId", authenticate, deleteProject);
router.get("/:id/projects/:projectId/tasks", authenticate, getProjectTasks);

// Team goals
router.get("/:id/goals", authenticate, getTeamGoals);
router.post("/:id/goals", authenticate, createTeamGoal);
router.delete("/:id/goals/:goalId", authenticate, deleteTeamGoal);

// Standups
router.get("/:id/standups", authenticate, getStandups);
router.get("/:id/standups/draft", authenticate, getStandupDraft);
router.put("/:id/standups", authenticate, saveStandup);

export default router;
