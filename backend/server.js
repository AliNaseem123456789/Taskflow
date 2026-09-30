import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import cron from "node-cron";
import { supabase } from "./config/supabase.js";
// import "./metrics/runtime.js"
import http from "node:http"
import https from "node:https"
import  fs  from "node:fs";
// import 
import authRoutes from "./routes/authRoutes.js";
import taskRoutes from "./routes/taskRoutes.js";
import emailRoutes from "./routes/emailRoutes.js";
import tagRoutes from "./routes/tagRoutes.js";
import teamRoutes from "./routes/teamRoutes.js";
import { sendReminderToUser } from "./controllers/emailController.js";
import { register } from "./metrics/metrics.js";
import { requestLogger } from "./middleware/logger.js";
dotenv.config();

const app = express();
app.use(requestLogger)
// app.use(cors());
app.use(cors({ origin: "http://localhost:5174", credentials: true }));
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/auth", authRoutes);
app.use("/tasks", taskRoutes);   // includes /tasks/search, /tasks/streak, /tasks/:id/comments, /tasks/:id/react
app.use("/email", emailRoutes);
app.use("/tags", tagRoutes);
app.use("/teams", teamRoutes);


app.get("/health", (_req, res) => res.json({ ok: true, time: new Date().toISOString() }));

// const tlsOptions = {
//     key: fs.readFileSync("E:/win-Acme-challenges/taskdoneflow.duckdns.org-key.pem"),
//     cert: fs.readFileSync("E:/win-Acme-challenges/taskdoneflow.duckdns.org-chain.pem"),
//     passphrase: "12345"
// };
// app.get("/metrics", async (req, res) => {

//     res.set("Content-Type", register.contentType);

//     res.end(await register.metrics());

// });
app.get("/debug", (req, res) => {
  res.json({
    pid: process.pid,
    ppid: process.ppid,
    uptime: process.uptime(),
    argv: process.argv,
  });
});

let counter = 0;

app.get("/increment", (req, res) => {
  counter++;
  res.json({
    pid: process.pid,
    counter,
  });
});
// ── Cron: per-user reminders (runs every minute) ──────────────────────────────
cron.schedule("* * * * *", async () => {
  const now = new Date();
  const today = now.toLocaleDateString("en-US", { weekday: "short" });
  const currentMinutes = now.getHours() * 60 + now.getMinutes();
   console.log(`[Cron] Tick @ ${now.toISOString()} (worker ${process.env.NODE_APP_INSTANCE ?? "n/a"}, pid ${process.pid})`);
  const { data: reminders, error } = await supabase
    .from("user_reminders")
    .select("*")
    .eq("is_active", true);

  if (error) return console.error("[Cron] Error fetching reminders:", error.message);

  for (const r of reminders) {
    if (!r.days?.includes(today)) continue;

    const reminderMinutes = (() => {
      const [clock, meridian] = r.time.split(" ");
      let [h, m] = clock.split(":").map(Number);
      if (meridian === "PM" && h !== 12) h += 12;
      if (meridian === "AM" && h === 12) h = 0;
      return h * 60 + m;
    })();

    if (Math.abs(reminderMinutes - currentMinutes) > 1) continue;
    if (!r.delivery_method?.map((d) => d.toLowerCase()).includes("email")) continue;

    const { data: userData } = await supabase
      .from("users")
      .select("email, name")
      .eq("id", r.user_id)
      .single();

    if (!userData?.email) continue;

    const subject =
      r.type === "digest" ? "Your Daily Digest" : "Daily Reminder";
    const message =
      r.type === "digest"
        ? "Here's a reminder to review and log your tasks for the day."
        : "Don't forget to log what you've accomplished today!";

    try {
      await sendReminderToUser(userData, subject, message);
    } catch (e) {
      console.error(`[Cron] Failed to send to ${userData.email}:`, e.message);
    }
  }
});

console.log("Server time:", new Date().toString());

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`));
const Server=http.createServer(app);
// Server.listen(5000,()=>{
//   console.log("Server running on port 3000")
// });

// https.createServer(tlsOptions,app).listen(3000,"0.0.0.0",()=>{
//   console.log("Https server o port 3000")
// })
console.log(process.pid)
process.on("SIGTERM",()=>{
  console.log("Sigterm recieved");
  Server.close(()=>{
    console.log("Server closed")
    process.exit(0);
  })
})