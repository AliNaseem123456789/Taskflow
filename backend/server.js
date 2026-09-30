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
import { runReminderJob } from "./controllers/emailController.js";
import { requestLogger } from "./middleware/logger.js";

const app = express();

// FRONTEND_URL can hold several origins separated by commas
const allowedOrigins = (process.env.FRONTEND_URL || "http://localhost:5174")
  .split(",")
  .map((o) => o.trim())
  .filter(Boolean);

app.use(requestLogger);
app.use(cors({ origin: allowedOrigins, credentials: true }));
app.use(express.json());
app.use(cookieParser());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/auth", authRoutes);
app.use("/tasks", taskRoutes);   // includes /tasks/search, /tasks/streak, /tasks/:id/comments, /tasks/:id/react
app.use("/email", emailRoutes);
app.use("/tags", tagRoutes);
app.use("/teams", teamRoutes);

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
