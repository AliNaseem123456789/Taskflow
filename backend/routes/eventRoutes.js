import express from "express";
import { streamEvents } from "../controllers/eventController.js";
import { authenticateStream } from "../middleware/auth.js";

const router = express.Router();

router.get("/", authenticateStream, streamEvents);

export default router;
