import express from "express";
import {
  getMyProfile, saveMyProfile, searchPeople, searchCompanies, profileActions, applyPublic, myApplicationsEverywhere, withdrawPublic,
} from "../controllers/profileController.js";
import { authenticate } from "../middleware/auth.js";
import { rateLimit } from "../middleware/rateLimit.js";

const router = express.Router();

// My public profile (opt-in)
router.get("/me", authenticate, getMyProfile);
router.put("/me", authenticate, saveMyProfile);

// Discovery — logged in only, to keep scrapers out
router.get("/search", authenticate, rateLimit("search", 120), searchPeople);
router.get("/companies", authenticate, rateLimit("search", 120), searchCompanies);
router.get("/view/:handle/actions", authenticate, profileActions);

// Public roles: apply from your profile, follow your applications
router.post("/jobs/:jobId/apply", authenticate, rateLimit("apply", 20), applyPublic);
router.get("/applications", authenticate, myApplicationsEverywhere);
router.post("/applications/:appId/withdraw", authenticate, withdrawPublic);

export default router;
