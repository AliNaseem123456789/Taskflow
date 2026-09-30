import nodemailer from "nodemailer";
import { supabase } from "../config/supabase.js";
import { clockIn, parseClock } from "../utils/time.js";
import { sendSms } from "../utils/sms.js";
import { postToSlack } from "../utils/slack.js";
import { sendPushToUsers } from "../utils/push.js";
import { decrypt } from "../utils/secrets.js";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  // fail fast instead of blocking the reminder loop for minutes
  connectionTimeout: 15000,
  greetingTimeout: 10000,
  socketTimeout: 20000,
});

// Full link into the frontend, e.g. appLink("/verify-email?token=abc")
export const appLink = (path) => {
  const base = (process.env.FRONTEND_URL || "http://localhost:5174").split(",")[0].trim();
  return `${base.replace(/\/$/, "")}${path}`;
};

// Records every message we send in email_logs. Never throws.
export const logMessage = async ({ to, subject, status, error = null, channel = "email" }) => {
  try {
    await supabase.from("email_logs").insert([
      {
        channel,
        to,
        subject,
        status,
        error: error ? String(error).slice(0, 250) : null,
        sent_at: status === "sent" ? new Date().toISOString() : null,
        created_at: new Date().toISOString(),
      },
    ]);
  } catch {
    // logging must never break sending
  }
};

// Send one email. Returns true/false instead of throwing.
export const sendEmail = async (to, subject, text, html) => {
  try {
    await transporter.sendMail({
      from: `"MyDones" <${process.env.EMAIL_USER}>`,
      to,
      subject,
      text,
      ...(html ? { html } : {}),
    });
    await logMessage({ to, subject, status: "sent" });
    return true;
  } catch (err) {
    console.error(`Email to ${to} failed:`, err.message);
    await logMessage({ to, subject, status: "failed", error: err.message });
    return false;
  }
};

const sendReminderToUser = async (user, subject, message) =>
  sendEmail(user.email, subject, `Hi ${user.name || "there"}!\n\n${message}\n\n– MyDones Team`);

export const sendReminder = async (req, res) => {
  const { subject = "Daily Reminder", message = "Don’t forget to complete your tasks!" } = req.body;

  try {
    const { data: user, error } = await supabase
      .from("users")
      .select("email, name")
      .eq("id", req.user.id)
      .single();

    if (error || !user) throw new Error("User not found");

    const ok = await sendReminderToUser(user, subject, message);
    if (!ok) throw new Error("Email could not be sent");
    res.status(200).json({ success: true, message: "Reminder sent successfully" });
  } catch (err) {
    console.error("Email error:", err.message);
    res.status(500).json({ error: err.message });
  }
};
export const createOrUpdateReminder = async (req, res) => {
  const { type, time, days, delivery_method, is_active = true } = req.body;

  if (!type || !time || !days || !delivery_method)
    return res.status(400).json({ error: "Missing required fields" });

  try {
    const { data: existing } = await supabase
      .from("user_reminders")
      .select("*")
      .eq("user_id", req.user.id)
      .eq("type", type)
      .limit(1)
      .maybeSingle();

    let result;
    if (existing) {
      const { data, error } = await supabase
        .from("user_reminders")
        .update({ time, days, delivery_method, is_active })
        .eq("id", existing.id)
        .select("*")
        .single();
      if (error) throw error;
      result = data;
    } else {
      const { data, error } = await supabase
        .from("user_reminders")
        .insert([{ user_id: req.user.id, type, time, days, delivery_method, is_active }])
        .select("*")
        .single();
      if (error) throw error;
      result = data;
    }

    res.status(200).json({ success: true, reminder: result });
  } catch (err) {
    console.error("Reminder create/update error:", err.message);
    res.status(500).json({ error: err.message });
  }
};
export const getUserReminders = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("user_reminders")
      .select("*")
      .eq("user_id", req.user.id);
    if (error) throw error;
    res.status(200).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
export const toggleReminderActive = async (req, res) => {
  try {
    const { is_active } = req.body;
    const { data, error } = await supabase
      .from("user_reminders")
      .update({ is_active })
      .eq("id", req.params.id)
      .eq("user_id", req.user.id)
      .select("*")
      .single();
    if (error) throw error;
    res.status(200).json({ success: true, reminder: data });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── Cron job: per-user reminders (called every minute from server.js) ────────
//
// Each reminder fires in the user's own timezone. The "claim" update on
// last_sent makes sure a reminder is only sent once, even if the server runs
// several workers or a tick is late.

const SEND_WINDOW_MIN = 5; // still send if we're up to 5 minutes late

// Marks the reminder as sent. Returns false if it was already sent in the
// last hour (another worker or an earlier tick got it first).
const claimReminder = async (id) => {
  const now = new Date().toISOString();
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const { data: neverSent } = await supabase
    .from("user_reminders")
    .update({ last_sent: now })
    .eq("id", id)
    .is("last_sent", null)
    .select("id");
  if (neverSent?.length) return true;

  const { data: sentLongAgo } = await supabase
    .from("user_reminders")
    .update({ last_sent: now })
    .eq("id", id)
    .lt("last_sent", cutoff)
    .select("id");
  return sentLongAgo?.length > 0;
};

export const runReminderJob = async () => {
  const { data: reminders, error } = await supabase
    .from("user_reminders")
    .select("*, users(id, email, name, timezone, phone, slack_webhook)")
    .eq("is_active", true);

  if (error) return console.error("[Cron] Error fetching reminders:", error.message);

  for (const r of reminders) {
    const user = r.users;
    if (!user?.email) continue;

    const now = clockIn(user.timezone);
    if (!r.days?.includes(now.weekday)) continue;

    const late = now.minutes - parseClock(r.time);
    if (late < 0 || late >= SEND_WINDOW_MIN) continue;

    const channels = (r.delivery_method || []).map((d) => d.toLowerCase());
    if (!channels.some((c) => ["email", "sms", "slack", "push"].includes(c))) continue;

    if (!(await claimReminder(r.id))) continue;

    const subject = r.type === "digest" ? "Your Daily Digest" : "Daily Reminder";
    const message =
      r.type === "digest"
        ? "Here's a reminder to review and log your tasks for the day."
        : "Don't forget to log what you've accomplished today!";

    await deliverReminder(user, channels, subject, message);
  }
};

// Sends one reminder on every channel the user picked. Each send is logged.
const deliverReminder = async (user, channels, subject, message) => {
  const text = `${subject}: ${message}`;
  const log = (channel, to, ok) => logMessage({ channel, to, subject, status: ok ? "sent" : "failed" });

  if (channels.includes("email")) await sendReminderToUser(user, subject, message);
  if (channels.includes("sms") && user.phone) log("sms", user.phone, await sendSms(user.phone, text));
  if (channels.includes("slack") && user.slack_webhook)
    log("slack", "slack", await postToSlack(decrypt(user.slack_webhook), `*${subject}*\n${message}`));
  if (channels.includes("push"))
    log("push", user.id, (await sendPushToUsers([user.id], { title: subject, body: message, url: "/mydones" })) > 0);
};

export { sendReminderToUser };
