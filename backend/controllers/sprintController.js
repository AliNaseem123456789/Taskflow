// controllers/sprintController.js
// Team sprints: plan from the backlog, run one at a time, watch the burndown,
// close with unfinished work carried over. Estimates are in the team's unit
// (story points or hours); tasks without an estimate count as 0 but are listed.
import { supabase } from "../config/supabase.js";
import { getMembership } from "./teamController.js";
import { taskAccess } from "../utils/permissions.js";
import { audit } from "../utils/audit.js";
import { publishToTeam } from "../utils/events.js";
import { addDays, todayIn } from "../utils/time.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "");
const TASK_FIELDS = "id, title, status, priority, estimate, due_date, completed_at, assignee_id, user_id, company_id, team_id, project_id, reviewer_id, sprint_id, position, assignee:users!assignee_id(id, name, email), projects(id, name, color)";
const sum = (rows) => Math.round(rows.reduce((s, t) => s + (Number(t.estimate) || 0), 0) * 10) / 10;

// Team + my access, or an answer. needManage: only leads / admins / the department's manager.
const teamCtx = async (req, res, needManage = false) => {
  const membership = await getMembership(req.params.id, req.user.id);
  if (!membership) {
    res.status(403).json({ error: "Not a team member" });
    return null;
  }
  if (needManage && membership.role !== "admin") {
    res.status(403).json({ error: "Only the team lead or an admin plans sprints" });
    return null;
  }
  const { data: team } = await supabase.from("teams").select("id, name, company_id, estimate_unit, sprint_length_days").eq("id", req.params.id).single();
  return { team, canManage: membership.role === "admin" };
};

const loadSprint = async (teamId, sprintId) => {
  if (!UUID_RE.test(sprintId || "")) return null;
  const { data } = await supabase.from("sprints").select("*").eq("id", sprintId).eq("team_id", teamId).maybeSingle();
  return data;
};

const sprintTasks = async (sprintId) => {
  const { data } = await supabase.from("tasks").select(TASK_FIELDS).eq("sprint_id", sprintId).is("parent_task_id", null)
    .order("position").order("id");
  return (data || []).map(({ projects, ...t }) => ({ ...t, project: projects || null }));
};

const stats = (tasks) => {
  const done = tasks.filter((t) => t.status === "Done");
  return {
    task_count: tasks.length, done_count: done.length, total: sum(tasks), done: sum(done),
    unestimated: tasks.filter((t) => t.estimate === null || t.estimate === undefined).length,
  };
};

// Remaining work per day: ideal straight line vs actual (from when tasks were finished)
const burndown = (sprint, tasks, today) => {
  const total = sprint.status === "planned" ? sum(tasks) : Number(sprint.committed ?? sum(tasks));
  const scopeNow = sum(tasks);
  const days = [];
  for (let d = sprint.start_date; d <= sprint.end_date; d = addDays(d, 1)) days.push(d);
  const span = Math.max(1, days.length - 1);
  return days.map((d, i) => {
    const doneBy = sum(tasks.filter((t) => t.status === "Done" && t.completed_at && t.completed_at.slice(0, 10) <= d));
    return {
      day: d,
      ideal: Math.round((total - (total * i) / span) * 10) / 10,
      remaining: d <= today ? Math.max(0, Math.round((scopeNow - doneBy) * 10) / 10) : null,
    };
  });
};

// ── GET /teams/:id/sprints — all sprints, newest first, with progress ────────
export const getSprints = async (req, res) => {
  const ctx = await teamCtx(req, res);
  if (!ctx) return;
  const { data: sprints, error } = await supabase.from("sprints").select("*").eq("team_id", req.params.id)
    .order("start_date", { ascending: false }).limit(100);
  if (error) return res.status(500).json({ error: error.message });
  const ids = sprints.map((s) => s.id);
  const { data: tasks } = ids.length
    ? await supabase.from("tasks").select("sprint_id, status, estimate").in("sprint_id", ids).is("parent_task_id", null)
    : { data: [] };
  res.json({
    team: ctx.team, can_manage: ctx.canManage,
    sprints: sprints.map((s) => ({ ...s, ...stats((tasks || []).filter((t) => t.sprint_id === s.id)) })),
  });
};

// ── GET /teams/:id/sprints/:sprintId — tasks + burndown ──────────────────────
export const getSprint = async (req, res) => {
  const ctx = await teamCtx(req, res);
  if (!ctx) return;
  const sprint = await loadSprint(req.params.id, req.params.sprintId);
  if (!sprint) return res.status(404).json({ error: "Sprint not found" });
  const tasks = await sprintTasks(sprint.id);
  const today = todayIn(req.user.timezone);
  res.json({
    sprint, team: ctx.team, can_manage: ctx.canManage, tasks, ...stats(tasks),
    burndown: burndown(sprint, tasks, today),
    days_left: sprint.status === "active" ? Math.max(0, Math.round((new Date(sprint.end_date) - new Date(today)) / 86400000)) : null,
  });
};

// ── GET /teams/:id/backlog — the team's open work not in a planned/active sprint
export const getBacklog = async (req, res) => {
  const ctx = await teamCtx(req, res);
  if (!ctx) return;
  const { data: open } = await supabase.from("sprints").select("id").eq("team_id", req.params.id).in("status", ["planned", "active"]);
  let q = supabase.from("tasks").select(TASK_FIELDS).eq("team_id", req.params.id).is("parent_task_id", null).neq("status", "Done");
  const openIds = (open || []).map((s) => s.id);
  q = openIds.length ? q.or(`sprint_id.is.null,sprint_id.not.in.(${openIds.join(",")})`) : q;
  const { data, error } = await q.order("priority", { ascending: false }).order("due_date", { ascending: true, nullsFirst: false }).limit(300);
  if (error) return res.status(500).json({ error: error.message });
  const rank = { urgent: 0, high: 1, medium: 2, low: 3 };
  res.json((data || []).map(({ projects, ...t }) => ({ ...t, project: projects || null }))
    .sort((a, b) => (rank[a.priority] ?? 2) - (rank[b.priority] ?? 2) || (a.due_date || "9999").localeCompare(b.due_date || "9999")));
};

// ── GET /teams/:id/velocity — the last closed sprints ────────────────────────
export const getVelocity = async (req, res) => {
  const ctx = await teamCtx(req, res);
  if (!ctx) return;
  const { data } = await supabase.from("sprints").select("id, name, start_date, end_date, committed, completed, committed_tasks, completed_tasks")
    .eq("team_id", req.params.id).eq("status", "closed").order("end_date", { ascending: false }).limit(8);
  const rows = (data || []).reverse();
  const recent = rows.slice(-3).map((s) => Number(s.completed) || 0);
  res.json({
    unit: ctx.team.estimate_unit, sprints: rows,
    average: recent.length ? Math.round((recent.reduce((a, b) => a + b, 0) / recent.length) * 10) / 10 : null,
  });
};

// ── POST /teams/:id/sprints { name?, goal?, start_date?, end_date? } ──────────
export const createSprint = async (req, res) => {
  const ctx = await teamCtx(req, res, true);
  if (!ctx) return;
  // default: starts the day after the last sprint ends (or today), team's usual length
  const { data: last } = await supabase.from("sprints").select("end_date").eq("team_id", req.params.id)
    .order("end_date", { ascending: false }).limit(1).maybeSingle();
  const today = todayIn(req.user.timezone);
  const start = isDate(req.body.start_date) ? req.body.start_date : last?.end_date && last.end_date >= today ? addDays(last.end_date, 1) : today;
  const end = isDate(req.body.end_date) ? req.body.end_date : addDays(start, ctx.team.sprint_length_days - 1);
  if (end < start) return res.status(400).json({ error: "A sprint can't end before it starts" });
  if ((new Date(end) - new Date(start)) / 86400000 > 90) return res.status(400).json({ error: "Keep sprints under 3 months" });
  const { count } = await supabase.from("sprints").select("id", { count: "exact", head: true }).eq("team_id", req.params.id);
  const name = String(req.body.name || "").trim().slice(0, 80) || `Sprint ${(count || 0) + 1}`;
  const { data, error } = await supabase.from("sprints").insert([{
    company_id: ctx.team.company_id, team_id: req.params.id, name, goal: String(req.body.goal || "").trim().slice(0, 500) || null,
    start_date: start, end_date: end, created_by: req.user.id,
  }]).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
  publishToTeam(req.params.id, "sprint", {}).catch(() => {});
};

// ── PUT /teams/:id/sprints/:sprintId { name?, goal?, start_date?, end_date? } ─
export const updateSprint = async (req, res) => {
  const ctx = await teamCtx(req, res, true);
  if (!ctx) return;
  const sprint = await loadSprint(req.params.id, req.params.sprintId);
  if (!sprint) return res.status(404).json({ error: "Sprint not found" });
  if (sprint.status === "closed") return res.status(400).json({ error: "A closed sprint can't change" });
  const u = {};
  if (req.body.name !== undefined) {
    const name = String(req.body.name || "").trim().slice(0, 80);
    if (!name) return res.status(400).json({ error: "Give the sprint a name" });
    u.name = name;
  }
  if (req.body.goal !== undefined) u.goal = String(req.body.goal || "").trim().slice(0, 500) || null;
  for (const k of ["start_date", "end_date"]) {
    if (req.body[k] === undefined) continue;
    if (!isDate(req.body[k])) return res.status(400).json({ error: "Invalid date" });
    u[k] = req.body[k];
  }
  if ((u.end_date || sprint.end_date) < (u.start_date || sprint.start_date)) return res.status(400).json({ error: "A sprint can't end before it starts" });
  const { data, error } = await supabase.from("sprints").update(u).eq("id", sprint.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
  publishToTeam(req.params.id, "sprint", {}).catch(() => {});
};

// ── DELETE /teams/:id/sprints/:sprintId — only a planned one; its tasks go back to the backlog
export const deleteSprint = async (req, res) => {
  const ctx = await teamCtx(req, res, true);
  if (!ctx) return;
  const sprint = await loadSprint(req.params.id, req.params.sprintId);
  if (!sprint) return res.status(404).json({ error: "Sprint not found" });
  if (sprint.status !== "planned") return res.status(400).json({ error: "Only a sprint that hasn't started can be deleted" });
  await supabase.from("sprints").delete().eq("id", sprint.id); // tasks' sprint_id -> null
  res.json({ success: true });
  publishToTeam(req.params.id, "sprint", {}).catch(() => {});
};

// ── PUT /teams/:id/sprints/:sprintId/tasks { add: [taskId], remove: [taskId] } ─
// Plan: move the team's tasks in or out. Tasks you can't edit are skipped.
export const planSprint = async (req, res) => {
  const ctx = await teamCtx(req, res, true);
  if (!ctx) return;
  const sprint = await loadSprint(req.params.id, req.params.sprintId);
  if (!sprint) return res.status(404).json({ error: "Sprint not found" });
  if (sprint.status === "closed") return res.status(400).json({ error: "That sprint is closed" });
  const ids = (list) => (Array.isArray(list) ? list.map(Number).filter(Number.isInteger).slice(0, 500) : []);
  const add = ids(req.body.add);
  const remove = ids(req.body.remove);
  let moved = 0;
  for (const [list, target] of [[add, sprint.id], [remove, null]]) {
    if (!list.length) continue;
    const { data: rows } = await supabase.from("tasks").select("*").in("id", list).eq("team_id", req.params.id);
    for (const row of rows || []) {
      if (target === null && row.sprint_id !== sprint.id) continue;
      if (!(await taskAccess(row, req.user.id)).canEdit) continue;
      await supabase.from("tasks").update({ sprint_id: target }).eq("id", row.id);
      moved++;
    }
  }
  res.json({ success: true, moved });
  publishToTeam(req.params.id, "sprint", {}).catch(() => {});
};

// ── POST /teams/:id/sprints/:sprintId/start ──────────────────────────────────
export const startSprint = async (req, res) => {
  const ctx = await teamCtx(req, res, true);
  if (!ctx) return;
  const sprint = await loadSprint(req.params.id, req.params.sprintId);
  if (!sprint) return res.status(404).json({ error: "Sprint not found" });
  if (sprint.status !== "planned") return res.status(400).json({ error: "This sprint already started" });
  const tasks = await sprintTasks(sprint.id);
  const today = todayIn(req.user.timezone);
  const { error } = await supabase.from("sprints").update({
    status: "active", started_at: new Date().toISOString(), committed: sum(tasks), committed_tasks: tasks.length,
    start_date: sprint.start_date > today ? today : sprint.start_date,
  }).eq("id", sprint.id).eq("status", "planned");
  if (error?.code === "23505") return res.status(400).json({ error: "Close the running sprint first" });
  if (error) return res.status(500).json({ error: error.message });
  await audit(req, ctx.team.company_id, "sprint.started", "sprint", sprint.id, { name: sprint.name, committed: sum(tasks) });
  res.json({ success: true });
  publishToTeam(req.params.id, "sprint", {}).catch(() => {});
};

// ── POST /teams/:id/sprints/:sprintId/close { carry_to: "next" | "backlog" } ──
// Unfinished work moves to the next planned sprint (made if needed) or back to the backlog.
export const closeSprint = async (req, res) => {
  const ctx = await teamCtx(req, res, true);
  if (!ctx) return;
  const sprint = await loadSprint(req.params.id, req.params.sprintId);
  if (!sprint) return res.status(404).json({ error: "Sprint not found" });
  if (sprint.status !== "active") return res.status(400).json({ error: "Only a running sprint can be closed" });
  const tasks = await sprintTasks(sprint.id);
  const done = tasks.filter((t) => t.status === "Done");
  const unfinished = tasks.filter((t) => t.status !== "Done");

  const { data: claimed } = await supabase.from("sprints").update({
    status: "closed", closed_at: new Date().toISOString(), completed: sum(done), completed_tasks: done.length,
  }).eq("id", sprint.id).eq("status", "active").select("id");
  if (!claimed?.length) return res.status(400).json({ error: "Already closed" });

  let target = null;
  if (req.body?.carry_to === "next" && unfinished.length) {
    const { data: next } = await supabase.from("sprints").select("id, name").eq("team_id", req.params.id).eq("status", "planned")
      .order("start_date").limit(1).maybeSingle();
    target = next;
    if (!target) {
      const start = addDays(sprint.end_date, 1);
      const { count } = await supabase.from("sprints").select("id", { count: "exact", head: true }).eq("team_id", req.params.id);
      const { data: made } = await supabase.from("sprints").insert([{
        company_id: ctx.team.company_id, team_id: req.params.id, name: `Sprint ${(count || 0) + 1}`,
        start_date: start, end_date: addDays(start, ctx.team.sprint_length_days - 1), created_by: req.user.id,
      }]).select("id, name").single();
      target = made;
    }
  }
  if (unfinished.length)
    await supabase.from("tasks").update({ sprint_id: target?.id || null }).in("id", unfinished.map((t) => t.id));
  await audit(req, ctx.team.company_id, "sprint.closed", "sprint", sprint.id,
    { name: sprint.name, completed: sum(done), committed: sprint.committed, carried: unfinished.length });
  res.json({ success: true, completed: sum(done), carried: unfinished.length, carried_to: target });
  publishToTeam(req.params.id, "sprint", {}).catch(() => {});
};

// ── PUT /teams/:id/sprint-settings { estimate_unit?, sprint_length_days? } ───
export const updateSprintSettings = async (req, res) => {
  const ctx = await teamCtx(req, res, true);
  if (!ctx) return;
  const u = {};
  if (req.body.estimate_unit !== undefined) {
    if (!["points", "hours"].includes(req.body.estimate_unit)) return res.status(400).json({ error: "Unit must be points or hours" });
    u.estimate_unit = req.body.estimate_unit;
  }
  if (req.body.sprint_length_days !== undefined) {
    const n = parseInt(req.body.sprint_length_days, 10);
    if (!(n >= 1 && n <= 60)) return res.status(400).json({ error: "Sprint length must be 1 to 60 days" });
    u.sprint_length_days = n;
  }
  const { data, error } = await supabase.from("teams").update(u).eq("id", req.params.id).select("id, estimate_unit, sprint_length_days").single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
};
