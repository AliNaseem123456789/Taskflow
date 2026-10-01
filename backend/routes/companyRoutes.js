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
import { authenticate } from "../middleware/auth.js";

const router = express.Router();

router.get("/", authenticate, getMyCompanies);
router.post("/", authenticate, createCompany);
router.get("/work-types", authenticate, getWorkTypes);

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

export default router;
