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
import { runReminderJob } from "./controllers/emailController.js";
import { runRecurringJob } from "./controllers/taskController.js";
import { runTeamDigestJob } from "./controllers/teamController.js";
import { runImportJob } from "./controllers/integrationController.js";
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
