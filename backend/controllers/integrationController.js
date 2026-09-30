import { supabase } from "../config/supabase.js";
import { encrypt, decrypt } from "../utils/secrets.js";
import { todayIn, addDays } from "../utils/time.js";
import { smsEnabled, isPhone, sendSms } from "../utils/sms.js";
import { isSlackWebhook, postToSlack } from "../utils/slack.js";
import { getPublicKey, sendPushToUsers } from "../utils/push.js";
import { sendEmail, appLink, logMessage } from "./emailController.js";
import { getMembership } from "./teamController.js";
import * as google from "../utils/google.js";
import { githubUser, githubCompleted } from "../utils/github.js";
import { jiraUser, jiraCompleted, normaliseSite } from "../utils/jira.js";
import { publishToTeammates } from "../utils/events.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

const getIntegration = async (userId, provider) => {
  const { data } = await supabase
    .from("integrations")
    .select("*")
    .eq("user_id", userId)
    .eq("provider", provider)
    .maybeSingle();
  return data;
};

const saveIntegration = (userId, provider, data) =>
  supabase
    .from("integrations")
    .upsert({ user_id: userId, provider, data, last_error: null }, { onConflict: "user_id,provider" });

const markSynced = (id, error = null) =>
  supabase
    .from("integrations")
    .update({ last_error: error, ...(error ? {} : { last_synced_at: new Date().toISOString() }) })
    .eq("id", id);

const publicStatus = (row, extra = {}) =>
  row
    ? { connected: true, last_synced_at: row.last_synced_at, last_error: row.last_error, ...extra }
    : { connected: false };

// ── GET /integrations ─────────────────────────────────────────────────────────
// What's set up on the server, and what this user has connected

export const getIntegrations = async (req, res) => {
  const [{ data: user }, { data: rows }, { count: pushDevices }] = await Promise.all([
    supabase.from("users").select("phone, slack_webhook").eq("id", req.user.id).single(),
    supabase.from("integrations").select("*").eq("user_id", req.user.id),
    supabase.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("user_id", req.user.id),
  ]);
  const find = (p) => rows?.find((r) => r.provider === p);
  const gh = find("github");
  const jr = find("jira");

  res.json({
    server: { sms: smsEnabled(), google: google.googleEnabled(), push: true, slack: true },
    phone: user?.phone || "",
    slack_connected: !!user?.slack_webhook,
    push_devices: pushDevices || 0,
    google: publicStatus(find("google")),
    github: publicStatus(gh, { username: gh?.data?.username }),
    jira: publicStatus(jr, { site: jr?.data?.site, email: jr?.data?.email }),
  });
};

// ── PUT /integrations/contact { phone?, slack_webhook? } ('' clears) ──────────

export const updateContact = async (req, res) => {
  const updates = {};
  if (req.body.phone !== undefined) {
    const phone = String(req.body.phone || "").replace(/[\s-]/g, "");
    if (phone && !isPhone(phone))
      return res.status(400).json({ error: "Use international format, e.g. +923001234567" });
    updates.phone = phone || null;
  }
  if (req.body.slack_webhook !== undefined) {
    const url = String(req.body.slack_webhook || "").trim();
    if (url && !isSlackWebhook(url))
      return res.status(400).json({ error: "That isn't a Slack webhook URL (https://hooks.slack.com/services/...)" });
    updates.slack_webhook = url ? encrypt(url) : null;
  }
  if (!Object.keys(updates).length) return res.status(400).json({ error: "Nothing to update" });

  const { error } = await supabase.from("users").update(updates).eq("id", req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
};

// ── POST /integrations/test { channel } — send yourself a test message ───────

export const sendTest = async (req, res) => {
  const { channel } = req.body;
  const { data: user } = await supabase
    .from("users")
    .select("email, name, phone, slack_webhook")
    .eq("id", req.user.id)
    .single();
  const text = "✅ Test from Taskflow — this channel works.";
  let ok = false;

  if (channel === "email") ok = await sendEmail(user.email, "Taskflow test", text);
  else if (channel === "sms") {
    if (!smsEnabled()) return res.status(400).json({ error: "SMS isn't set up on the server yet" });
    if (!user.phone) return res.status(400).json({ error: "Add your phone number first" });
    ok = await sendSms(user.phone, text);
    await logMessage({ to: user.phone, subject: "test", status: ok ? "sent" : "failed", channel: "sms" });
  } else if (channel === "slack") {
    if (!user.slack_webhook) return res.status(400).json({ error: "Add your Slack webhook first" });
    ok = await postToSlack(decrypt(user.slack_webhook), text);
  } else if (channel === "push") {
    ok = (await sendPushToUsers([req.user.id], { title: "Taskflow", body: text, url: "/integrations" })) > 0;
    if (!ok) return res.status(400).json({ error: "No browser is subscribed yet — click Enable first" });
  } else return res.status(400).json({ error: "Unknown channel" });

  if (!ok) return res.status(502).json({ error: "Sending failed — check the settings" });
  res.json({ success: true });
};

// ── Browser push ──────────────────────────────────────────────────────────────

// GET /integrations/push/key
export const getPushKey = async (_req, res) => {
  try {
    res.json({ publicKey: await getPublicKey() });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /integrations/push/subscribe { endpoint, keys: { p256dh, auth } }
export const subscribePush = async (req, res) => {
  const { endpoint, keys } = req.body || {};
  if (!/^https:\/\//.test(endpoint || "") || !keys?.p256dh || !keys?.auth)
    return res.status(400).json({ error: "Invalid subscription" });
  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      user_id: req.user.id,
      endpoint,
      p256dh: keys.p256dh,
      auth: keys.auth,
      user_agent: req.get("user-agent")?.slice(0, 250) || null,
    },
    { onConflict: "endpoint" }
  );
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
};

// DELETE /integrations/push/subscribe { endpoint }
export const unsubscribePush = async (req, res) => {
  await supabase
    .from("push_subscriptions")
    .delete()
    .eq("user_id", req.user.id)
    .eq("endpoint", req.body?.endpoint || "");
  res.json({ success: true });
};

// ── Google Calendar ───────────────────────────────────────────────────────────
// Tasks with a due date appear as all-day events in the user's calendar.

// GET /integrations/google/connect -> { url } to send the browser to
export const googleConnect = async (req, res) => {
  if (!google.googleEnabled())
    return res.status(400).json({ error: "Google Calendar isn't set up on the server yet" });
  res.json({ url: google.authUrl(req.user.id) });
};

// GET /integrations/google/callback?code&state (Google redirects here)
export const googleCallback = async (req, res) => {
  const back = (status) => res.redirect(appLink(`/integrations?google=${status}`));
  const userId = google.readState(req.query.state);
  if (!userId || !req.query.code) return back("error");

  try {
    const tokens = await google.exchangeCode(req.query.code);
    const existing = await getIntegration(userId, "google");
    // Google only sends a refresh token the first time; keep the old one otherwise
    const refresh = tokens.refresh_token
      ? encrypt(tokens.refresh_token)
      : existing?.data?.refresh_token;
    if (!refresh) return back("error");

    await saveIntegration(userId, "google", {
      refresh_token: refresh,
      access_token: encrypt(tokens.access_token),
      expires_at: Date.now() + (tokens.expires_in - 60) * 1000,
    });
    syncAllToGoogle(userId).catch(() => {});
    back("connected");
  } catch (err) {
    console.error("Google connect failed:", err.message);
    back("error");
  }
};

// A fresh access token for this user (refreshes and saves when needed)
const googleAccess = async (row) => {
  if (row.data.access_token && Date.now() < row.data.expires_at) return decrypt(row.data.access_token);
  const tokens = await google.refreshAccess(decrypt(row.data.refresh_token));
  const data = {
    ...row.data,
    access_token: encrypt(tokens.access_token),
    expires_at: Date.now() + (tokens.expires_in - 60) * 1000,
  };
  await supabase.from("integrations").update({ data }).eq("id", row.id);
  row.data = data;
  return tokens.access_token;
};

// Create / update / remove the calendar event for one task.
// Called after every task change; does nothing if Google isn't connected.
export const syncTaskToGoogle = async (userId, task, { deleted = false } = {}) => {
  if (!google.googleEnabled() || !task) return;
  const row = await getIntegration(userId, "google");
  if (!row) return;
  try {
    const token = await googleAccess(row);
    if (deleted || !task.due_date) {
      if (task.google_event_id) {
        await google.deleteEvent(token, task.google_event_id);
        if (!deleted) await supabase.from("tasks").update({ google_event_id: null }).eq("id", task.id);
      }
      return;
    }
    const eventId = await google.saveEvent(token, task.google_event_id, task);
    if (eventId !== task.google_event_id)
      await supabase.from("tasks").update({ google_event_id: eventId }).eq("id", task.id);
    await markSynced(row.id);
  } catch (err) {
    await markSynced(row.id, err.message);
  }
};

// Push every task that has a due date from 7 days ago onwards
const syncAllToGoogle = async (userId) => {
  const { data: user } = await supabase.from("users").select("timezone").eq("id", userId).single();
  const { data: tasks } = await supabase
    .from("tasks")
    .select("*")
    .eq("user_id", userId)
    .not("due_date", "is", null)
    .gte("due_date", addDays(todayIn(user?.timezone), -7));
  for (const t of tasks || []) await syncTaskToGoogle(userId, t);
  return tasks?.length || 0;
};

// POST /integrations/google/sync
export const googleSyncNow = async (req, res) => {
  if (!(await getIntegration(req.user.id, "google")))
    return res.status(400).json({ error: "Connect Google Calendar first" });
  const count = await syncAllToGoogle(req.user.id);
  const row = await getIntegration(req.user.id, "google");
  if (row.last_error) return res.status(502).json({ error: row.last_error });
  res.json({ synced: count });
};

// DELETE /integrations/google — events already created stay in the calendar
export const googleDisconnect = async (req, res) => {
  const row = await getIntegration(req.user.id, "google");
  if (row) {
    google.revokeToken(decrypt(row.data.refresh_token));
    await supabase.from("integrations").delete().eq("id", row.id);
    await supabase.from("tasks").update({ google_event_id: null }).eq("user_id", req.user.id);
  }
  res.json({ success: true });
};

// ── GitHub / Jira import ──────────────────────────────────────────────────────
// Finished work elsewhere becomes Done tasks here (never duplicated).

const SYNC_DAYS = 14;

// items: [{ external_id, url, title, doneAt }] -> new Done tasks
const importDone = async (userId, timezone, items) => {
  if (!items.length) return 0;
  const { data: existing } = await supabase
    .from("tasks")
    .select("external_id")
    .eq("user_id", userId)
    .in("external_id", items.map((i) => i.external_id));
  const seen = new Set((existing || []).map((t) => t.external_id));

  let added = 0;
  for (const item of items) {
    if (seen.has(item.external_id)) continue;
    const { error } = await supabase.from("tasks").insert([{
      user_id: userId,
      title: item.title.slice(0, 300),
      description: item.url,
      status: "Done",
      date_logged: todayIn(timezone, item.doneAt ? new Date(item.doneAt) : new Date()),
      external_id: item.external_id,
      external_url: item.url,
    }]);
    if (!error) added++; // an error here = another sync added it first
  }
  if (added) publishToTeammates(userId, "task", { action: "imported" });
  return added;
};

const runImport = async (row, timezone) => {
  const since = addDays(todayIn(timezone), -SYNC_DAYS);
  try {
    const items =
      row.provider === "github"
        ? await githubCompleted(decrypt(row.data.token), row.data.username, since)
        : await jiraCompleted(
            { site: row.data.site, email: row.data.email, token: decrypt(row.data.token) },
            since
          );
    const added = await importDone(row.user_id, timezone, items);
    await markSynced(row.id);
    return { added, found: items.length };
  } catch (err) {
    await markSynced(row.id, err.message);
    throw err;
  }
};

// PUT /integrations/github { token }
export const connectGithub = async (req, res) => {
  const token = String(req.body.token || "").trim();
  if (!token) return res.status(400).json({ error: "Paste a GitHub token" });
  try {
    const username = await githubUser(token);
    await saveIntegration(req.user.id, "github", { token: encrypt(token), username });
    res.json({ connected: true, username });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// PUT /integrations/jira { site, email, token }
export const connectJira = async (req, res) => {
  const site = normaliseSite(String(req.body.site || "").trim());
  const email = String(req.body.email || "").trim();
  const token = String(req.body.token || "").trim();
  if (!site || !email || !token)
    return res.status(400).json({ error: "Site, email and API token are all required" });
  try {
    const name = await jiraUser({ site, email, token });
    await saveIntegration(req.user.id, "jira", { site, email, token: encrypt(token), name });
    res.json({ connected: true, site, name });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// POST /integrations/github/sync, /integrations/jira/sync
export const syncNow = (provider) => async (req, res) => {
  const row = await getIntegration(req.user.id, provider);
  if (!row) return res.status(400).json({ error: "Not connected" });
  try {
    res.json(await runImport(row, req.user.timezone));
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
};

// DELETE /integrations/github, /integrations/jira — imported tasks stay
export const disconnect = (provider) => async (req, res) => {
  await supabase
    .from("integrations")
    .delete()
    .eq("user_id", req.user.id)
    .eq("provider", provider);
  res.json({ success: true });
};

// Cron (every 3 hours): import for everyone who connected GitHub or Jira
export const runImportJob = async () => {
  const { data: rows, error } = await supabase
    .from("integrations")
    .select("*, users(timezone)")
    .in("provider", ["github", "jira"]);
  if (error) return console.error("[Cron] imports:", error.message);
  for (const row of rows) {
    await runImport(row, row.users?.timezone).catch(() => {}); // error saved on the row
  }
};

// ── Team Slack channel (digest also posts there) ──────────────────────────────

// PUT /teams/:id/slack { webhook } — admin, '' removes it
export const setTeamSlack = async (req, res) => {
  const { id } = req.params;
  const membership = await getMembership(id, req.user.id);
  if (membership?.role !== "admin") return res.status(403).json({ error: "Admin only" });
  const url = String(req.body.webhook || "").trim();
  if (url && !isSlackWebhook(url))
    return res.status(400).json({ error: "That isn't a Slack webhook URL (https://hooks.slack.com/services/...)" });
  if (url && !(await postToSlack(url, "✅ Taskflow is connected. The team digest will be posted here.")))
    return res.status(400).json({ error: "Slack didn't accept that webhook" });
  await supabase.from("teams").update({ slack_webhook: url ? encrypt(url) : null }).eq("id", id);
  res.json({ connected: !!url });
};
