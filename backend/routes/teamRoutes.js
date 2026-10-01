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
  getProjectMembers,
  getProjectBoard,
  moveOnBoard,
  saveProjectStatuses,
  addProjectMember,
  removeProjectMember,
  getTeamGoals,
  createTeamGoal,
  deleteTeamGoal,
} from "../controllers/projectController.js";
import { getStandups, getStandupDraft, saveStandup } from "../controllers/standupController.js";
import { setTeamSlack } from "../controllers/integrationController.js";
import { getProjectUpdates, postProjectUpdate } from "../controllers/knowledgeController.js";
import {
  getSprints,
  getSprint,
  getBacklog,
  getVelocity,
  createSprint,
  updateSprint,
  deleteSprint,
  planSprint,
  startSprint,
  closeSprint,
  updateSprintSettings,
} from "../controllers/sprintController.js";
import { getTimeline, createMilestone, updateMilestone, deleteMilestone } from "../controllers/planningController.js";
import { authenticate } from "../middleware/auth.js";
import { workspace } from "../middleware/workspace.js";

// login check + the chosen workspace (X-Company-Id header)
const auth = [authenticate, workspace];

const router = express.Router();

router.get("/", auth, getMyTeams);
router.post("/", auth, createTeam);
router.post("/join", auth, joinTeam);

// Named routes first (before /:id)
router.get("/projects/mine", auth, getMyProjects);
router.get("/invites/lookup", auth, lookupInvite);
router.post("/invites/accept", auth, acceptInvite);

router.get("/:id", auth, getTeam);
router.delete("/:id", auth, deleteTeam);
router.post("/:id/leave", auth, leaveTeam);
router.delete("/:id/members/:userId", auth, removeMember);
router.put("/:id/members/:userId/role", auth, updateMemberRole);
router.post("/:id/regenerate-invite", auth, regenerateInvite);
router.get("/:id/feed", auth, getTeamFeed);
router.get("/:id/stats", auth, getTeamStats);

// Digest
router.post("/:id/digest", auth, sendTeamDigest);
router.put("/:id/digest-settings", auth, updateDigestSettings);
router.put("/:id/slack", auth, setTeamSlack);

// Email invites
router.get("/:id/invites", auth, getInvites);
router.post("/:id/invites", auth, createInvite);
router.delete("/:id/invites/:inviteId", auth, revokeInvite);

// Projects
router.get("/:id/projects", auth, getProjects);
router.post("/:id/projects", auth, createProject);
router.put("/:id/projects/:projectId", auth, updateProject);
router.delete("/:id/projects/:projectId", auth, deleteProject);
router.get("/:id/projects/:projectId/tasks", auth, getProjectTasks);
router.get("/:id/projects/:projectId/members", auth, getProjectMembers);
router.get("/:id/projects/:projectId/board", auth, getProjectBoard);
router.put("/:id/projects/:projectId/board/move", auth, moveOnBoard);
router.put("/:id/projects/:projectId/statuses", auth, saveProjectStatuses);
router.get("/:id/projects/:projectId/updates", auth, getProjectUpdates);
router.get("/:id/projects/:projectId/timeline", auth, getTimeline);
router.post("/:id/projects/:projectId/milestones", auth, createMilestone);
router.put("/:id/projects/:projectId/milestones/:milestoneId", auth, updateMilestone);
router.delete("/:id/projects/:projectId/milestones/:milestoneId", auth, deleteMilestone);

// Sprints
router.get("/:id/sprints", auth, getSprints);
router.post("/:id/sprints", auth, createSprint);
router.get("/:id/sprints/:sprintId", auth, getSprint);
router.put("/:id/sprints/:sprintId", auth, updateSprint);
router.delete("/:id/sprints/:sprintId", auth, deleteSprint);
router.put("/:id/sprints/:sprintId/tasks", auth, planSprint);
router.post("/:id/sprints/:sprintId/start", auth, startSprint);
router.post("/:id/sprints/:sprintId/close", auth, closeSprint);
router.get("/:id/backlog", auth, getBacklog);
router.get("/:id/velocity", auth, getVelocity);
router.put("/:id/sprint-settings", auth, updateSprintSettings);
router.post("/:id/projects/:projectId/updates", auth, postProjectUpdate);
router.post("/:id/projects/:projectId/members", auth, addProjectMember);
router.delete("/:id/projects/:projectId/members/:userId", auth, removeProjectMember);

// Team goals
router.get("/:id/goals", auth, getTeamGoals);
router.post("/:id/goals", auth, createTeamGoal);
router.delete("/:id/goals/:goalId", auth, deleteTeamGoal);

// Standups
router.get("/:id/standups", auth, getStandups);
router.get("/:id/standups/draft", auth, getStandupDraft);
router.put("/:id/standups", auth, saveStandup);

export default router;
