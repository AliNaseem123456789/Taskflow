// controllers/planningController.js
// Seeing work over time: a project's timeline (tasks as bars, "waits for" links,
// milestones) and portfolios (several projects followed together).
import { supabase } from "../config/supabase.js";
import { getMembership } from "./teamController.js";
import { canUseProject } from "./projectController.js";
import { can, getCompanyMember, isCompanyAdmin } from "../utils/permissions.js";
import { audit } from "../utils/audit.js";
import { publishToTeam } from "../utils/events.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "");
const today = () => new Date().toISOString().slice(0, 10);

const projectFor = async (req, res) => {
  const { id, projectId } = req.params;
  if (!UUID_RE.test(projectId || "")) {
    res.status(404).json({ error: "Project not found" });
    return null;
  }
  const { data: project } = await supabase.from("projects")
    .select("id, name, color, team_id, company_id, start_date, target_date").eq("id", projectId).eq("team_id", id).maybeSingle();
  if (!project || !(await canUseProject(req.user.id, projectId))) {
    res.status(404).json({ error: "Project not found" });
    return null;
  }
  return project;
};

// ── GET /teams/:id/projects/:projectId/timeline ─────────────────────────────
// Bars from start (or the day it was logged) to due date, links between them, milestones.
export const getTimeline = async (req, res) => {
  const project = await projectFor(req, res);
  if (!project) return;
  const [{ data: tasks }, { data: milestones }] = await Promise.all([
    supabase.from("tasks")
      .select("id, title, status, priority, start_date, due_date, date_logged, completed_at, estimate, parent_task_id, assignee:users!assignee_id(id, name, email)")
      .eq("project_id", project.id).is("parent_task_id", null).order("start_date", { ascending: true, nullsFirst: false }).limit(500),
    supabase.from("milestones").select("*").eq("project_id", project.id).order("date"),
  ]);
  const ids = (tasks || []).map((t) => t.id);
  const { data: deps } = ids.length
    ? await supabase.from("task_dependencies").select("task_id, blocked_by_id").in("task_id", ids).in("blocked_by_id", ids)
    : { data: [] };
  const membership = await getMembership(req.params.id, req.user.id);
  const rows = (tasks || []).map((t) => {
    const start = t.start_date || t.date_logged;
    const end = t.due_date && t.due_date >= start ? t.due_date : start;
    return { ...t, bar_start: start, bar_end: end, scheduled: !!(t.start_date || t.due_date),
      late: t.status !== "Done" && !!t.due_date && t.due_date < today() };
  });
  // a task that ends after the one waiting for it starts = a scheduling clash
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  const links = (deps || []).map((d) => ({
    from: d.blocked_by_id, to: d.task_id,
    clash: byId[d.blocked_by_id] && byId[d.task_id] && byId[d.blocked_by_id].bar_end > byId[d.task_id].bar_start,
  }));
  res.json({ project, tasks: rows, links, milestones: milestones || [], can_manage: membership?.role === "admin" });
};

// ── Milestones ───────────────────────────────────────────────────────────────

// POST /teams/:id/projects/:projectId/milestones { name, date } — lead / admin
export const createMilestone = async (req, res) => {
  const membership = await getMembership(req.params.id, req.user.id);
  if (membership?.role !== "admin") return res.status(403).json({ error: "The team lead or an admin sets milestones" });
  const project = await projectFor(req, res);
  if (!project) return;
  const name = String(req.body.name || "").trim().slice(0, 120);
  if (!name || !isDate(req.body.date)) return res.status(400).json({ error: "A milestone needs a name and a date" });
  const { data, error } = await supabase.from("milestones").insert([{
    company_id: project.company_id, project_id: project.id, name, date: req.body.date, created_by: req.user.id,
  }]).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
  publishToTeam(req.params.id, "project", {}).catch(() => {});
};

// PUT /teams/:id/projects/:projectId/milestones/:milestoneId { name?, date?, done? }
export const updateMilestone = async (req, res) => {
  const membership = await getMembership(req.params.id, req.user.id);
  if (membership?.role !== "admin") return res.status(403).json({ error: "The team lead or an admin sets milestones" });
  const project = await projectFor(req, res);
  if (!project) return;
  const u = {};
  if (req.body.name !== undefined) {
    const name = String(req.body.name || "").trim().slice(0, 120);
    if (!name) return res.status(400).json({ error: "A milestone needs a name" });
    u.name = name;
  }
  if (req.body.date !== undefined) {
    if (!isDate(req.body.date)) return res.status(400).json({ error: "Invalid date" });
    u.date = req.body.date;
  }
  if (req.body.done !== undefined) u.done = !!req.body.done;
  const { data, error } = await supabase.from("milestones").update(u)
    .eq("id", req.params.milestoneId).eq("project_id", project.id).select().maybeSingle();
  if (error || !data) return res.status(404).json({ error: "Milestone not found" });
  res.json(data);
  publishToTeam(req.params.id, "project", {}).catch(() => {});
};

// DELETE /teams/:id/projects/:projectId/milestones/:milestoneId
export const deleteMilestone = async (req, res) => {
  const membership = await getMembership(req.params.id, req.user.id);
  if (membership?.role !== "admin") return res.status(403).json({ error: "The team lead or an admin sets milestones" });
  const project = await projectFor(req, res);
  if (!project) return;
  await supabase.from("milestones").delete().eq("id", req.params.milestoneId).eq("project_id", project.id);
  res.json({ success: true });
};

// ═════════════════════════════ Portfolios ═══════════════════════════════════

const memberOr404 = async (req, res) => {
  const member = await getCompanyMember(req.params.id, req.user.id);
  if (!member || member.role === "guest") {
    res.status(404).json({ error: "Company not found" });
    return null;
  }
  return member;
};
// admins and managers curate portfolios; everyone (but guests) can look
const canCurate = (member, portfolio) => isCompanyAdmin(member) || can(member, "transfers.approve") || portfolio?.owner_id === member.user_id;

// Roll-up numbers for each project (only the ones this person can see)
const projectRollup = async (projectIds, userId) => {
  const visible = [];
  for (const id of projectIds) if (await canUseProject(userId, id)) visible.push(id);
  if (!visible.length) return [];
  const [{ data: projects }, { data: tasks }, { data: updates }, { data: milestones }] = await Promise.all([
    supabase.from("projects").select("id, name, color, team_id, start_date, target_date, archived, teams(name)").in("id", visible),
    supabase.from("tasks").select("project_id, status, due_date, estimate").in("project_id", visible).is("parent_task_id", null),
    supabase.from("project_updates").select("project_id, health, summary, created_at").in("project_id", visible).order("created_at", { ascending: false }),
    supabase.from("milestones").select("project_id, name, date, done").in("project_id", visible).order("date"),
  ]);
  return (projects || []).map(({ teams, ...p }) => {
    const mine = (tasks || []).filter((t) => t.project_id === p.id);
    const done = mine.filter((t) => t.status === "Done");
    const latest = (updates || []).find((u) => u.project_id === p.id);
    const next = (milestones || []).find((m) => m.project_id === p.id && !m.done);
    return {
      ...p, team_name: teams?.name,
      total: mine.length, done: done.length, progress: mine.length ? Math.round((done.length / mine.length) * 100) : 0,
      overdue: mine.filter((t) => t.status !== "Done" && t.due_date && t.due_date < today()).length,
      health: latest?.health || null, health_summary: latest?.summary || null, health_at: latest?.created_at || null,
      next_milestone: next || null,
      late: !!p.target_date && p.target_date < today() && done.length < mine.length,
    };
  }).sort((a, b) => (a.target_date || "9999").localeCompare(b.target_date || "9999"));
};

// GET /companies/:id/portfolios
export const getPortfolios = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  const { data, error } = await supabase.from("portfolios")
    .select("*, owner:users!owner_id(id, name, email), portfolio_projects(project_id)").eq("company_id", req.params.id).order("name");
  if (error) return res.status(500).json({ error: error.message });
  const out = [];
  for (const p of data) {
    const rollup = await projectRollup(p.portfolio_projects.map((x) => x.project_id), req.user.id);
    const { portfolio_projects: _pp, ...rest } = p;
    out.push({
      ...rest, project_count: rollup.length,
      progress: rollup.length ? Math.round(rollup.reduce((s, r) => s + r.progress, 0) / rollup.length) : 0,
      at_risk: rollup.filter((r) => r.health && r.health !== "on_track").length,
      overdue: rollup.reduce((s, r) => s + r.overdue, 0),
      can_edit: canCurate(member, p),
    });
  }
  res.json({ portfolios: out, can_create: canCurate(member, null) });
};

// GET /companies/:id/portfolios/:portfolioId
export const getPortfolio = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  const { data: p } = await supabase.from("portfolios").select("*, owner:users!owner_id(id, name, email), portfolio_projects(project_id)")
    .eq("id", req.params.portfolioId).eq("company_id", req.params.id).maybeSingle();
  if (!p) return res.status(404).json({ error: "Portfolio not found" });
  const projects = await projectRollup(p.portfolio_projects.map((x) => x.project_id), req.user.id);
  const { portfolio_projects: _pp, ...rest } = p;
  res.json({ ...rest, projects, hidden_projects: p.portfolio_projects.length - projects.length, can_edit: canCurate(member, p) });
};

// POST /companies/:id/portfolios { name, description?, project_ids? }
export const createPortfolio = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  if (!canCurate(member, null)) return res.status(403).json({ error: "Admins and managers create portfolios" });
  const name = String(req.body.name || "").trim().slice(0, 100);
  if (!name) return res.status(400).json({ error: "Give the portfolio a name" });
  const { data, error } = await supabase.from("portfolios").insert([{
    company_id: req.params.id, name, description: String(req.body.description || "").trim().slice(0, 1000) || null, owner_id: req.user.id,
  }]).select().single();
  if (error) return res.status(500).json({ error: error.message });
  if (Array.isArray(req.body.project_ids)) await setProjects(data.id, req.params.id, req.body.project_ids, req.user.id);
  await audit(req, req.params.id, "portfolio.created", "portfolio", data.id, { name });
  res.status(201).json(data);
};

// Replace the portfolio's projects (only projects of this company that you can see)
const setProjects = async (portfolioId, companyId, ids, userId) => {
  const clean = [...new Set(ids.filter((x) => UUID_RE.test(String(x))))].slice(0, 200);
  const { data: projects } = clean.length
    ? await supabase.from("projects").select("id").eq("company_id", companyId).in("id", clean)
    : { data: [] };
  const allowed = [];
  for (const p of projects || []) if (await canUseProject(userId, p.id)) allowed.push(p.id);
  await supabase.from("portfolio_projects").delete().eq("portfolio_id", portfolioId);
  if (allowed.length) await supabase.from("portfolio_projects").insert(allowed.map((project_id) => ({ portfolio_id: portfolioId, project_id })));
  return allowed.length;
};

// PUT /companies/:id/portfolios/:portfolioId { name?, description?, project_ids? }
export const updatePortfolio = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  const { data: p } = await supabase.from("portfolios").select("*").eq("id", req.params.portfolioId).eq("company_id", req.params.id).maybeSingle();
  if (!p) return res.status(404).json({ error: "Portfolio not found" });
  if (!canCurate(member, p)) return res.status(403).json({ error: "Only its owner, managers and admins change it" });
  const u = {};
  if (req.body.name !== undefined) {
    const name = String(req.body.name || "").trim().slice(0, 100);
    if (!name) return res.status(400).json({ error: "Give the portfolio a name" });
    u.name = name;
  }
  if (req.body.description !== undefined) u.description = String(req.body.description || "").trim().slice(0, 1000) || null;
  if (Object.keys(u).length) await supabase.from("portfolios").update(u).eq("id", p.id);
  let count;
  if (Array.isArray(req.body.project_ids)) {
    // keep projects that are in it but hidden from this editor
    const { data: current } = await supabase.from("portfolio_projects").select("project_id").eq("portfolio_id", p.id);
    const hidden = [];
    for (const row of current || []) if (!(await canUseProject(req.user.id, row.project_id))) hidden.push(row.project_id);
    count = await setProjects(p.id, req.params.id, req.body.project_ids, req.user.id);
    if (hidden.length) await supabase.from("portfolio_projects").insert(hidden.map((project_id) => ({ portfolio_id: p.id, project_id })));
  }
  res.json({ success: true, projects: count });
};

// DELETE /companies/:id/portfolios/:portfolioId
export const deletePortfolio = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  const { data: p } = await supabase.from("portfolios").select("*").eq("id", req.params.portfolioId).eq("company_id", req.params.id).maybeSingle();
  if (!p) return res.status(404).json({ error: "Portfolio not found" });
  if (!canCurate(member, p)) return res.status(403).json({ error: "Only its owner, managers and admins delete it" });
  await supabase.from("portfolios").delete().eq("id", p.id);
  res.json({ success: true });
};
