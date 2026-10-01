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
import { getCompanyUpdates } from "../controllers/knowledgeController.js";
import { getAnalytics } from "../controllers/analyticsController.js";
import { getPortfolios, getPortfolio, createPortfolio, updatePortfolio, deletePortfolio } from "../controllers/planningController.js";
import { getCompanyAiUsage } from "../controllers/aiController.js";
import { getForms, getForm, createForm, updateForm, deleteForm, submitForm, getSubmissions } from "../controllers/workflowController.js";
import { getJobs, getJob, createJob, updateJob, deleteJob, applyToJob, withdrawApplication, updateApplication, getMyApplications } from "../controllers/jobController.js";
import {
  getTimeOff,
  requestTimeOff,
  decideTimeOff,
  cancelTimeOff,
  getHolidays,
  addHoliday,
  deleteHoliday,
  getWorkload,
} from "../controllers/timeOffController.js";
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
router.get("/:id/updates", authenticate, getCompanyUpdates);

// time off, holidays and workload
router.get("/:id/time-off", authenticate, getTimeOff);
router.post("/:id/time-off", authenticate, requestTimeOff);
router.post("/:id/time-off/:timeOffId/decide", authenticate, decideTimeOff);
router.post("/:id/time-off/:timeOffId/cancel", authenticate, cancelTimeOff);
router.get("/:id/holidays", authenticate, getHolidays);
router.post("/:id/holidays", authenticate, addHoliday);
router.delete("/:id/holidays/:holidayId", authenticate, deleteHoliday);
router.get("/:id/workload", authenticate, getWorkload);
router.get("/:id/analytics", authenticate, getAnalytics);
router.get("/:id/portfolios", authenticate, getPortfolios);
router.post("/:id/portfolios", authenticate, createPortfolio);
router.get("/:id/portfolios/:portfolioId", authenticate, getPortfolio);
router.put("/:id/portfolios/:portfolioId", authenticate, updatePortfolio);
router.delete("/:id/portfolios/:portfolioId", authenticate, deletePortfolio);
router.get("/:id/ai-usage", authenticate, getCompanyAiUsage);

// Request forms: fill one in and it becomes a task in a project
router.get("/:id/forms", authenticate, getForms);
router.post("/:id/forms", authenticate, createForm);
router.get("/:id/forms/:formId", authenticate, getForm);
router.put("/:id/forms/:formId", authenticate, updateForm);
router.delete("/:id/forms/:formId", authenticate, deleteForm);
router.post("/:id/forms/:formId/submit", authenticate, submitForm);
router.get("/:id/forms/:formId/submissions", authenticate, getSubmissions);

// Internal job board (applications are confidential to the applicant and the hiring side)
router.get("/:id/jobs", authenticate, getJobs);
router.post("/:id/jobs", authenticate, createJob);
router.get("/:id/jobs/:jobId", authenticate, getJob);
router.put("/:id/jobs/:jobId", authenticate, updateJob);
router.delete("/:id/jobs/:jobId", authenticate, deleteJob);
router.post("/:id/jobs/:jobId/apply", authenticate, applyToJob);
router.post("/:id/jobs/:jobId/withdraw", authenticate, withdrawApplication);
router.put("/:id/applications/:appId", authenticate, updateApplication);
router.get("/:id/my-applications", authenticate, getMyApplications);

export default router;
