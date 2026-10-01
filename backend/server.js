import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import cron from "node-cron";

import authRoutes from "./routes/authRoutes.js";
import taskRoutes from "./routes/taskRoutes.js";
import emailRoutes from "./routes/emailRoutes.js";
import tagRoutes from "./routes/tagRoutes.js";
import teamRoutes from "./routes/teamRoutes.js";
import goalRoutes from "./routes/goalRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import eventRoutes from "./routes/eventRoutes.js";
import integrationRoutes from "./routes/integrationRoutes.js";
import companyRoutes from "./routes/companyRoutes.js";
import meetingRoutes from "./routes/meetingRoutes.js";
import decisionRoutes from "./routes/decisionRoutes.js";
import wikiRoutes from "./routes/wikiRoutes.js";
import aiRoutes from "./routes/aiRoutes.js";
import timeRoutes from "./routes/timeRoutes.js";
import approvalRoutes from "./routes/approvalRoutes.js";
import { runReminderJob } from "./controllers/emailController.js";
import { runRecurringJob } from "./controllers/taskController.js";
import { runTeamDigestJob } from "./controllers/teamController.js";
import { runImportJob } from "./controllers/integrationController.js";
import { runTransfersJob } from "./controllers/companyLifeController.js";
import { runMeetingReminderJob, runMeetingSeriesJob } from "./controllers/meetingController.js";
import { requestLogger } from "./middleware/logger.js";

const app = express();

// FRONTEND_URL can hold several origins separated by commas
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5174")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(requestLogger);
app.use(cors({
  origin: allowedOrigins,
  credentials: true,
  allowedHeaders: ["Content-Type", "Authorization", "X-Company-Id"],
}));
app.use(express.json());
app.use(cookieParser());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/auth", authRoutes);
app.use("/tasks", taskRoutes);   // includes /tasks/search, /tasks/streak, /tasks/:id/comments, /tasks/:id/react
app.use("/email", emailRoutes);
app.use("/tags", tagRoutes);
app.use("/teams", teamRoutes);
app.use("/goals", goalRoutes);
app.use("/notifications", notificationRoutes);
app.use("/events", eventRoutes); // live updates (Server-Sent Events)
app.use("/integrations", integrationRoutes);
app.use("/companies", companyRoutes);
app.use("/meetings", meetingRoutes);
app.use("/decisions", decisionRoutes);
app.use("/wiki", wikiRoutes);
app.use("/ai", aiRoutes);
app.use("/time", timeRoutes);
app.use("/approvals", approvalRoutes);

app.get("/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// ── Cron jobs ─────────────────────────────────────────────────────────────────
// With pm2 cluster mode every worker loads this file; only worker 0 runs jobs.
const isMainWorker =
  !process.env.NODE_APP_INSTANCE || process.env.NODE_APP_INSTANCE === "0";

if (isMainWorker) {
  // Per-user reminders (every minute, in each user's timezone)
  cron.schedule("* * * * *", () =>
    runReminderJob().catch((e) => console.error("[Cron] reminders:", e.message))
  );

  // Scheduled team digests (every minute, in each team's timezone)
  cron.schedule("* * * * *", () =>
    runTeamDigestJob().catch((e) => console.error("[Cron] digests:", e.message))
  );

  // Recurring tasks: checked every hour so each user gets theirs just after
  // their own midnight. Also runs once at startup to catch up.
  const recurring = () =>
    runRecurringJob().catch((e) => console.error("[Cron] recurring:", e.message));
  cron.schedule("5 * * * *", recurring);
  recurring();

  // meetings: reminders shortly before, and the next meeting of each repeating series
  cron.schedule("*/5 * * * *", () =>
    runMeetingReminderJob().catch((e) => console.error("[Cron] meeting reminders:", e.message))
  );
  cron.schedule("15 * * * *", () =>
    runMeetingSeriesJob().catch((e) => console.error("[Cron] meeting series:", e.message))
  );

  // approved team moves whose date has come
  cron.schedule("10 * * * *", () =>
    runTransfersJob().catch((e) => console.error("[Cron] transfers:", e.message))
  );

  // GitHub / Jira: import finished work every 3 hours
  cron.schedule("20 */3 * * *", () =>
    runImportJob().catch((e) => console.error("[Cron] imports:", e.message))
  );
}

const PORT = process.env.PORT || 5000;
const server = app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));

process.on("SIGTERM", () => {
  console.log("SIGTERM received");
  server.close(() => {
    console.log("Server closed");
    process.exit(0);
  });
});
