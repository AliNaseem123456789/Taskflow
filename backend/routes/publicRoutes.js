import express from "express";
import { getPublicProfile, getPublicCompany, getPublicJob } from "../controllers/profileController.js";
import { rateLimit } from "../middleware/rateLimit.js";

// Pages anyone can open without logging in (only what their owners made public)
const router = express.Router();
const limit = rateLimit("public", 60);

router.get("/people/:handle", limit, getPublicProfile);
router.get("/companies/:slug", limit, getPublicCompany);
router.get("/jobs/:jobId", limit, getPublicJob);

export default router;
