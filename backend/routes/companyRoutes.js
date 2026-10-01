import express from "express";
import {
  getMyCompanies,
  createCompany,
  getCompany,
  updateCompany,
  deleteCompany,
  getMembers,
  updateMember,
  removeMember,
  leaveCompany,
  transferOwnership,
  getAuditLog,
  getWorkTypes,
} from "../controllers/companyController.js";
import {
  getDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  placeTeam,
  getOrgChart,
} from "../controllers/structureController.js";
import {
  createCompanyInvite,
  getCompanyInvites,
  revokeCompanyInvite,
  lookupCompanyInvite,
  acceptCompanyInvite,
  discoverCompanies,
  joinByDomain,
  getJoinRequests,
  decideJoinRequest,
  getTemplates,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  assignTemplate,
} from "../controllers/joinController.js";
import {
  requestTransfer,
  getTransfers,
  decideTransfer,
  cancelTransfer,
  getAnnouncements,
  createAnnouncement,
  markAnnouncementRead,
  getAnnouncementReads,
  deleteAnnouncement,
  getOpenWork,
} from "../controllers/companyLifeController.js";
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.get("/", authenticate, getMyCompanies);
router.post("/", authenticate, createCompany);
router.get("/work-types", authenticate, getWorkTypes);
router.get("/discover", authenticate, discoverCompanies);
router.get("/invites/lookup", authenticate, lookupCompanyInvite);
router.post("/invites/accept", authenticate, acceptCompanyInvite);

router.get("/:id", authenticate, getCompany);
router.put("/:id", authenticate, updateCompany);
router.delete("/:id", authenticate, deleteCompany);
router.post("/:id/leave", authenticate, leaveCompany);
router.post("/:id/transfer-ownership", authenticate, transferOwnership);
router.get("/:id/audit", authenticate, getAuditLog);

router.get("/:id/members", authenticate, getMembers);
router.put("/:id/members/:userId", authenticate, updateMember);
router.delete("/:id/members/:userId", authenticate, removeMember);

// structure: departments, where teams sit, org chart + directory
router.get("/:id/departments", authenticate, getDepartments);
router.post("/:id/departments", authenticate, createDepartment);
router.put("/:id/departments/:deptId", authenticate, updateDepartment);
router.delete("/:id/departments/:deptId", authenticate, deleteDepartment);
router.put("/:id/teams/:teamId/placement", authenticate, placeTeam);
router.get("/:id/org", authenticate, getOrgChart);

// joining: invites, email-domain join, join requests, onboarding checklists
router.get("/:id/invites", authenticate, getCompanyInvites);
router.post("/:id/invites", authenticate, createCompanyInvite);
router.delete("/:id/invites/:inviteId", authenticate, revokeCompanyInvite);
router.post("/:id/join", authenticate, joinByDomain);
router.get("/:id/join-requests", authenticate, getJoinRequests);
router.post("/:id/join-requests/:requestId", authenticate, decideJoinRequest);
router.get("/:id/onboarding", authenticate, getTemplates);
router.post("/:id/onboarding", authenticate, createTemplate);
router.put("/:id/onboarding/:templateId", authenticate, updateTemplate);
router.delete("/:id/onboarding/:templateId", authenticate, deleteTemplate);
router.post("/:id/onboarding/:templateId/assign", authenticate, assignTemplate);

// company life: team moves, announcements, handing over work
router.get("/:id/transfers", authenticate, getTransfers);
router.post("/:id/transfers", authenticate, requestTransfer);
router.post("/:id/transfers/:transferId/decide", authenticate, decideTransfer);
router.post("/:id/transfers/:transferId/cancel", authenticate, cancelTransfer);
router.get("/:id/announcements", authenticate, getAnnouncements);
router.post("/:id/announcements", authenticate, createAnnouncement);
router.post("/:id/announcements/:aid/read", authenticate, markAnnouncementRead);
router.get("/:id/announcements/:aid/reads", authenticate, getAnnouncementReads);
router.delete("/:id/announcements/:aid", authenticate, deleteAnnouncement);
router.get("/:id/members/:userId/open-work", authenticate, getOpenWork);

export default router;
