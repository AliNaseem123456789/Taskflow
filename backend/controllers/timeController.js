// controllers/timeController.js
// Time tracking: a running timer (one per person), manual entries, a weekly
// timesheet, time on a task, and a company report with estimate vs actual and CSV.
// Personal time (no company) is only ever seen by the person who logged it.
import { supabase } from "../config/supabase.js";
import { taskAccess, isCompanyAdmin, can } from "../utils/permissions.js";
import { todayIn } from "../utils/time.js";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_MINUTES = 1440;
const ENTRY_SELECT = "*, task:tasks!task_id(id, title, status, estimate, team_id, project_id), project:projects!project_id(id, name, color)";

const clipNote = (v) => (v === undefined ? undefined : String(v || "").trim().slice(0, 500) || null);
const minutesBetween = (a, b) => Math.min(MAX_MINUTES, Math.max(1, Math.round((new Date(b) - new Date(a)) / 60000)));

// A task you can see, with what's needed to file time against it
const taskFor = async (taskId, userId) => {
  if (taskId === null || taskId === undefined || taskId === "") return { task: null };
  const { data: task } = await supabase.from("tasks")
    .select("id, title, company_id, team_id, project_id, user_id, assignee_id, reviewer_id, estimate").eq("id", Number(taskId)).maybeSingle();
  const access = await taskAccess(task, userId);
  if (!access.canView) return { error: "Task not found" };
  if (task.company_id && access.member?.role === "viewer") return { error: "Viewers can't log time" };
  return { task };
};

// Where an entry belongs: the task's company, or the workspace you're in
const placement = (task, req) => ({
  company_id: task ? task.company_id || null : req.company?.id || null,
  task_id: task?.id || null,
  team_id: task?.team_id || null,
  project_id: task?.project_id || null,
});

// Stop whatever timer is running for this person; returns the stopped entry
const stopRunning = async (userId) => {
  const { data: run } = await supabase.from("time_entries").select("*").eq("user_id", userId).is("ended_at", null).not("started_at", "is", null).maybeSingle();
  if (!run) return null;
  const ended_at = new Date().toISOString();
  const { data } = await supabase.from("time_entries")
    .update({ ended_at, minutes: minutesBetween(run.started_at, ended_at) }).eq("id", run.id).select(ENTRY_SELECT).single();
  return data;
};

// GET /time/running
export const getRunning = async (req, res) => {
  const { data, error } = await supabase.from("time_entries").select(ENTRY_SELECT)
    .eq("user_id", req.user.id).is("ended_at", null).not("started_at", "is", null).maybeSingle();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ running: data || null });
};

// POST /time/start { task_id?, note? } — stops a running timer first
export const startTimer = async (req, res) => {
  const { task, error } = await taskFor(req.body.task_id, req.user.id);
  if (error) return res.status(400).json({ error });
  if (!task && req.company?.member?.role === "viewer") return res.status(403).json({ error: "Viewers can't log time" });
  const stopped = await stopRunning(req.user.id);
  const { data, error: e2 } = await supabase.from("time_entries").insert([{
    user_id: req.user.id, ...placement(task, req), note: clipNote(req.body.note),
    work_date: todayIn(req.user.timezone), started_at: new Date().toISOString(),
  }]).select(ENTRY_SELECT).single();
  if (e2) return res.status(500).json({ error: e2.message });
  res.status(201).json({ running: data, stopped });
};

// POST /time/stop
export const stopTimer = async (req, res) => {
  const stopped = await stopRunning(req.user.id);
  if (!stopped) return res.status(404).json({ error: "No timer is running" });
  res.json({ stopped });
};

// GET /time/entries?from=&to= — my own entries (company workspace: that company only)
export const getEntries = async (req, res) => {
  const today = todayIn(req.user.timezone);
  const from = DATE_RE.test(req.query.from || "") ? req.query.from : today;
  const to = DATE_RE.test(req.query.to || "") ? req.query.to : from;
  let q = supabase.from("time_entries").select(ENTRY_SELECT).eq("user_id", req.user.id)
    .gte("work_date", from).lte("work_date", to).order("work_date").order("created_at");
  if (req.company) q = q.eq("company_id", req.company.id);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  const total = data.reduce((s, e) => s + (e.minutes || 0), 0);
  res.json({ from, to, entries: data, total_minutes: total });
};

// Check minutes / date / billable from a body
const readEntry = (body, partial) => {
  const out = {};
  if (body.minutes !== undefined || !partial) {
    const m = Math.round(Number(body.minutes));
    if (!Number.isFinite(m) || m < 1 || m > MAX_MINUTES) return { error: "Minutes must be between 1 and 1440" };
    out.minutes = m;
  }
  if (body.work_date !== undefined || !partial) {
    if (!DATE_RE.test(body.work_date || "")) return { error: "Pick a date" };
    out.work_date = body.work_date;
  }
  if (body.note !== undefined) out.note = clipNote(body.note);
  if (body.billable !== undefined) out.billable = !!body.billable;
  return { out };
};

// POST /time/entries { task_id?, work_date, minutes, note?, billable? }
export const addEntry = async (req, res) => {
  const { out, error } = readEntry(req.body, false);
  if (error) return res.status(400).json({ error });
  const { task, error: e1 } = await taskFor(req.body.task_id, req.user.id);
  if (e1) return res.status(400).json({ error: e1 });
  if (!task && req.company?.member?.role === "viewer") return res.status(403).json({ error: "Viewers can't log time" });
  const { data, error: e2 } = await supabase.from("time_entries")
    .insert([{ user_id: req.user.id, ...placement(task, req), ...out }]).select(ENTRY_SELECT).single();
  if (e2) return res.status(500).json({ error: e2.message });
  res.status(201).json(data);
};

const ownEntry = async (req, res) => {
  const { data } = await supabase.from("time_entries").select("*").eq("id", req.params.id).maybeSingle();
  if (!data || data.user_id !== req.user.id) {
    res.status(404).json({ error: "Entry not found" });
    return null;
  }
  return data;
};

// PUT /time/entries/:id { minutes?, work_date?, note?, billable?, task_id? }
export const updateEntry = async (req, res) => {
  const entry = await ownEntry(req, res);
  if (!entry) return;
  const { out, error } = readEntry(req.body, true);
  if (error) return res.status(400).json({ error });
  if (out.minutes !== undefined && !entry.ended_at && entry.started_at)
    return res.status(400).json({ error: "Stop the timer before changing its minutes" });
  if (req.body.task_id !== undefined) {
    const { task, error: e1 } = await taskFor(req.body.task_id, req.user.id);
    if (e1) return res.status(400).json({ error: e1 });
    const p = placement(task, req);
    // an entry stays in its workspace: personal time can't become company time or the other way round
    if (task && (task.company_id || null) !== (entry.company_id || null))
      return res.status(400).json({ error: "That task is in another workspace" });
    Object.assign(out, { task_id: p.task_id, team_id: p.team_id, project_id: p.project_id });
  }
  const { data, error: e2 } = await supabase.from("time_entries").update(out).eq("id", entry.id).select(ENTRY_SELECT).single();
  if (e2) return res.status(500).json({ error: e2.message });
  res.json(data);
};

// DELETE /time/entries/:id
export const deleteEntry = async (req, res) => {
  const entry = await ownEntry(req, res);
  if (!entry) return;
  await supabase.from("time_entries").delete().eq("id", entry.id);
  res.json({ success: true });
};

// Teams whose time this member may see in reports: "all" for admins/managers
// without a department, otherwise the teams they lead or manage.
const reportableTeams = async (member, companyId, userId) => {
  if (isCompanyAdmin(member)) return "all";
  const isManager = can(member, "transfers.approve");
  if (isManager && !member.department_id) return "all";
  const [{ data: teams }, { data: leads }] = await Promise.all([
    supabase.from("teams").select("id, department_id").eq("company_id", companyId),
    supabase.from("team_members").select("team_id").eq("user_id", userId).eq("role", "lead"),
  ]);
  const ids = new Set((leads || []).map((l) => l.team_id));
  if (isManager) for (const t of teams || []) if (t.department_id === member.department_id) ids.add(t.id);
  return ids;
};

const unitOf = async (teamIds) => {
  if (!teamIds.length) return {};
  const { data } = await supabase.from("teams").select("id, name, estimate_unit").in("id", teamIds);
  return Object.fromEntries((data || []).map((t) => [t.id, t]));
};

// GET /time/tasks/:taskId — time on one task
export const getTaskTime = async (req, res) => {
  const { task, error } = await taskFor(req.params.taskId, req.user.id);
  if (error || !task) return res.status(404).json({ error: "Task not found" });
  const { data } = await supabase.from("time_entries")
    .select("id, user_id, minutes, work_date, note, started_at, ended_at, billable, user:users!user_id(id, name, email)")
    .eq("task_id", task.id).order("work_date", { ascending: false });
  // personal tasks only have the owner's time anyway; company tasks show everyone's time on them
  const rows = (data || []).filter((e) => task.company_id || e.user_id === req.user.id);
  const people = {};
  for (const e of rows) {
    if (!e.minutes) continue;
    people[e.user_id] = people[e.user_id] || { user: e.user, minutes: 0 };
    people[e.user_id].minutes += e.minutes;
  }
  const team = task.team_id ? (await unitOf([task.team_id]))[task.team_id] : null;
  const total = rows.reduce((s, e) => s + (e.minutes || 0), 0);
  const unit = team?.estimate_unit || "points";
  res.json({
    total_minutes: total,
    mine_minutes: rows.filter((e) => e.user_id === req.user.id).reduce((s, e) => s + (e.minutes || 0), 0),
    people: Object.values(people).sort((a, b) => b.minutes - a.minutes),
    entries: rows.slice(0, 50),
    estimate: task.estimate, estimate_unit: unit,
    estimate_minutes: task.estimate !== null && unit === "hours" ? Math.round(Number(task.estimate) * 60) : null,
  });
};

// one CSV cell; text that a spreadsheet would run as a formula gets a leading '
const csvCell = (v) => {
  let s = v === null || v === undefined ? "" : String(v);
  if (typeof v === "string" && /^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\n\r']/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// GET /time/report?from&to&group=person|project|task&team_id&project_id&user_id&format=csv
// Company workspace only. Everyone sees their own time; team leads their teams'; admins and managers more.
export const getReport = async (req, res) => {
  if (!req.company) return res.status(400).json({ error: "Reports are for company workspaces" });
  const member = req.company.member;
  if (member.role === "guest") return res.status(403).json({ error: "Guests can't see time reports" });
  const today = todayIn(req.user.timezone);
  const from = DATE_RE.test(req.query.from || "") ? req.query.from : today.slice(0, 8) + "01";
  const to = DATE_RE.test(req.query.to || "") ? req.query.to : today;
  const group = ["person", "project", "task", "team"].includes(req.query.group) ? req.query.group : "person";

  let q = supabase.from("time_entries")
    .select("id, user_id, task_id, team_id, project_id, work_date, minutes, billable, note, user:users!user_id(id, name, email), task:tasks!task_id(id, title, status, estimate), project:projects!project_id(id, name, color)")
    .eq("company_id", req.company.id).gte("work_date", from).lte("work_date", to).not("minutes", "is", null)
    .order("work_date");
  if (req.query.team_id) q = q.eq("team_id", req.query.team_id);
  if (req.query.project_id) q = q.eq("project_id", req.query.project_id);
  if (req.query.user_id) q = q.eq("user_id", req.query.user_id);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });

  const allowed = await reportableTeams(member, req.company.id, req.user.id);
  const rows = data.filter((e) => e.user_id === req.user.id || allowed === "all" || (e.team_id && allowed.has(e.team_id)));
  const teams = await unitOf([...new Set(rows.map((e) => e.team_id).filter(Boolean))]);

  if (req.query.format === "csv") {
    const lines = [["Date", "Person", "Email", "Team", "Project", "Task", "Minutes", "Hours", "Billable", "Note"].join(",")];
    for (const e of rows)
      lines.push([e.work_date, e.user?.name, e.user?.email, teams[e.team_id]?.name, e.project?.name, e.task?.title,
        e.minutes, (e.minutes / 60).toFixed(2), e.billable ? "yes" : "no", e.note].map(csvCell).join(","));
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="time-${from}-to-${to}.csv"`);
    return res.send("﻿" + lines.join("\r\n"));
  }

  const groups = {};
  for (const e of rows) {
    const key = group === "person" ? e.user_id : group === "project" ? e.project_id || "none" : group === "team" ? e.team_id || "none" : e.task_id || "none";
    const label = group === "person" ? e.user?.name || e.user?.email
      : group === "project" ? e.project?.name || "No project"
      : group === "team" ? teams[e.team_id]?.name || "No team"
      : e.task?.title || "No task";
    const g = (groups[key] = groups[key] || { key, label, minutes: 0, billable_minutes: 0, entries: 0 });
    g.minutes += e.minutes;
    if (e.billable) g.billable_minutes += e.minutes;
    g.entries++;
    if (group === "task" && e.task) {
      const unit = teams[e.team_id]?.estimate_unit || "points";
      Object.assign(g, { status: e.task.status, estimate: e.task.estimate, estimate_unit: unit,
        estimate_minutes: e.task.estimate !== null && unit === "hours" ? Math.round(Number(e.task.estimate) * 60) : null });
    }
  }
  const days = {};
  for (const e of rows) days[e.work_date] = (days[e.work_date] || 0) + e.minutes;

  res.json({
    from, to, group,
    scope: allowed === "all" ? "company" : allowed.size ? "teams" : "mine",
    total_minutes: rows.reduce((s, e) => s + e.minutes, 0),
    billable_minutes: rows.filter((e) => e.billable).reduce((s, e) => s + e.minutes, 0),
    groups: Object.values(groups).sort((a, b) => b.minutes - a.minutes),
    days: Object.entries(days).map(([date, minutes]) => ({ date, minutes })),
  });
};

// Minutes logged on a set of tasks (used by sprints)
export const minutesOnTasks = async (taskIds) => {
  if (!taskIds.length) return 0;
  const { data } = await supabase.from("time_entries").select("minutes").in("task_id", taskIds).not("minutes", "is", null);
  return (data || []).reduce((s, e) => s + e.minutes, 0);
};
