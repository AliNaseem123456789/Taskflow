import { supabase } from "../config/supabase.js";
import { getMembership } from "./teamController.js";
import { normaliseTasks } from "./taskController.js";
import { withProgress } from "./goalController.js";
import { publishToTeam } from "../utils/events.js";
import { getCompanyMember, taskScope, taskAccess } from "../utils/permissions.js";
import { audit } from "../utils/audit.js";
import { WORK_TYPES } from "../utils/workTypes.js";
import { ensureStatuses, columnFor, legacyStatus, CATEGORIES } from "../utils/projectStatuses.js";
import { fieldValuesFor } from "./workflowController.js";

const COLOR_RE = /^#[0-9a-f]{6}$/i;

// true if the user may see this project (and so add tasks to it)
export const canUseProject = async (userId, projectId) => {
  const { data: project } = await supabase
    .from("projects").select("id, team_id, company_id").eq("id", projectId).maybeSingle();
  if (!project) return false;
  const member = await getCompanyMember(project.company_id, userId);
  if (!member) return false;
  const scope = await taskScope(member);
  return scope.all || scope.projectIds.includes(project.id) || scope.teamIds.includes(project.team_id);
};

const memberIdsOf = async (teamId) => {
  const { data } = await supabase.from("team_members").select("user_id").eq("team_id", teamId);
  return (data || []).map((m) => m.user_id);
};

// progress scope for a team's goals
const teamScope = async (teamId) => {
  const { data: team } = await supabase.from("teams").select("company_id").eq("id", teamId).single();
  return { teamId, companyId: team.company_id, memberIds: await memberIdsOf(teamId) };
};

// ── Projects ─────────────────────────────────────────────────────────────────

// GET /teams/projects/mine -> active projects I can add tasks to, in the
// chosen company (the task form's "Project" list). Empty in Personal.
export const getMyProjects = async (req, res) => {
  if (!req.company) return res.json([]);
  const scope = await taskScope(req.company.member);
  let query = supabase
    .from("projects")
    .select("id, name, color, team_id, company_id, visibility, teams(name)")
    .eq("company_id", req.company.id)
    .eq("archived", false);
  if (!scope.all) {
    const parts = [];
    if (scope.teamIds.length) parts.push(`team_id.in.(${scope.teamIds.join(",")})`);
    if (scope.projectIds.length) parts.push(`id.in.(${scope.projectIds.join(",")})`);
    if (!parts.length) return res.json([]);
    query = query.or(parts.join(","));
  }
  const { data, error } = await query.order("name");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map((p) => ({ ...p, team_name: p.teams?.name, teams: undefined })));
};

// GET /teams/:id/projects -> with task counts
export const getProjects = async (req, res) => {
  const { id } = req.params;
  if (!(await getMembership(id, req.user.id))) return res.status(403).json({ error: "Not a team member" });

  const { data: projects, error } = await supabase
    .from("projects")
    .select("*")
    .eq("team_id", id)
    .order("archived")
    .order("created_at");
  if (error) return res.status(500).json({ error: error.message });

  const ids = projects.map((p) => p.id);
  const { data: tasks } = ids.length
    ? await supabase.from("tasks").select("project_id, status").in("project_id", ids)
    : { data: [] };

  res.json(
    projects.map((p) => {
      const mine = (tasks || []).filter((t) => t.project_id === p.id);
      return { ...p, total: mine.length, done: mine.filter((t) => t.status === "Done").length };
    })
  );
};

const readProject = (body, partial = false) => {
  const fields = {};
  if (!partial || body.name !== undefined) {
    const name = String(body.name || "").trim();
    if (!name) return { error: "Project name is required" };
    fields.name = name.slice(0, 80);
  }
  if (body.description !== undefined) fields.description = String(body.description || "").trim() || null;
  if (body.color !== undefined) {
    if (!COLOR_RE.test(body.color)) return { error: "Color must look like #3b82f6" };
    fields.color = body.color;
  }
  if (body.archived !== undefined) fields.archived = !!body.archived;
  for (const key of ["start_date", "target_date"]) {
    if (body[key] === undefined) continue;
    if (body[key] && !/^\d{4}-\d{2}-\d{2}$/.test(body[key])) return { error: "Dates look like 2026-10-01" };
    fields[key] = body[key] || null;
  }
  if (fields.start_date && fields.target_date && fields.target_date < fields.start_date)
    return { error: "The target date can't be before the start" };
  if (body.visibility !== undefined) {
    if (!["team", "company"].includes(body.visibility)) return { error: "Visibility must be team or company" };
    fields.visibility = body.visibility;
  }
  return { fields };
};

// POST /teams/:id/projects (admin)
export const createProject = async (req, res) => {
  const { id } = req.params;
  const membership = await getMembership(id, req.user.id);
  if (membership?.role !== "admin") return res.status(403).json({ error: "Admin only" });
  const { fields, error: invalid } = readProject(req.body);
  if (invalid) return res.status(400).json({ error: invalid });

  const { data: team } = await supabase.from("teams").select("company_id, companies(work_type)").eq("id", id).single();
  // columns come from the kind of work: the one picked for this project, else the company's
  const workType = WORK_TYPES[req.body.work_type] ? req.body.work_type : team.companies?.work_type || "general";
  const { data, error } = await supabase
    .from("projects")
    .insert([{ ...fields, work_type: workType, team_id: id, company_id: team.company_id, created_by: req.user.id }])
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  await ensureStatuses(data.id); // board columns from the company's kind of work
  await audit(req, team.company_id, "project.created", "project", data.id, { name: data.name });
  res.status(201).json({ ...data, total: 0, done: 0 });
  publishToTeam(id, "project", {});
};

// PUT /teams/:id/projects/:projectId (admin)
export const updateProject = async (req, res) => {
  const { id, projectId } = req.params;
  const membership = await getMembership(id, req.user.id);
  if (membership?.role !== "admin") return res.status(403).json({ error: "Admin only" });
  const { fields, error: invalid } = readProject(req.body, true);
  if (invalid) return res.status(400).json({ error: invalid });

  const { data, error } = await supabase
    .from("projects")
    .update(fields)
    .eq("id", projectId)
    .eq("team_id", id)
    .select("*")
    .single();
  if (error) return res.status(404).json({ error: "Project not found" });
  res.json(data);
  publishToTeam(id, "project", {});
};

// DELETE /teams/:id/projects/:projectId (admin) — tasks stay, just lose the project
export const deleteProject = async (req, res) => {
  const { id, projectId } = req.params;
  const membership = await getMembership(id, req.user.id);
  if (membership?.role !== "admin") return res.status(403).json({ error: "Admin only" });
  await supabase.from("projects").delete().eq("id", projectId).eq("team_id", id);
  res.json({ success: true });
  publishToTeam(id, "project", {});
};

// GET /teams/:id/projects/:projectId/tasks -> every member's tasks in the project
export const getProjectTasks = async (req, res) => {
  const { id, projectId } = req.params;
  if (!(await getMembership(id, req.user.id))) return res.status(403).json({ error: "Not a team member" });

  const { data, error } = await supabase
    .from("tasks")
    .select("*, creator:users!user_id(id, name, email), assignee:users!assignee_id(id, name, email), projects!inner(id, name, color, team_id), task_tags(tags(id, name, color)), task_reactions(user_id, emoji)")
    .eq("project_id", projectId)
    .eq("projects.team_id", id)
    .order("date_logged", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  const values = await fieldValuesFor(data.map((t) => t.id));
  res.json(normaliseTasks(data).map((t) => ({ ...t, owner: t.assignee || t.creator, fields: values[t.id] || {} })));
};

// ── Project board: columns and cards ────────────────────────────────────────

const projectInTeam = async (teamId, projectId) => {
  const { data } = await supabase
    .from("projects").select("id, name, color, team_id, company_id").eq("id", projectId).eq("team_id", teamId).maybeSingle();
  return data;
};

// GET /teams/:id/projects/:projectId/board -> { statuses, tasks, can_edit_columns }
// Anyone who can use the project (team, managers, people added to it, guests on it).
export const getProjectBoard = async (req, res) => {
  const { id, projectId } = req.params;
  const project = await projectInTeam(id, projectId);
  if (!project || !(await canUseProject(req.user.id, projectId))) return res.status(404).json({ error: "Project not found" });

  const statuses = await ensureStatuses(projectId);
  const doneIds = statuses.filter((s) => s.category === "done").map((s) => s.id);
  const { data: tasks, error } = await supabase
    .from("tasks")
    .select("id, title, status, status_id, priority, due_date, date_logged, position, user_id, assignee_id, reviewer_id, company_id, team_id, project_id, completed_at, assignee:users!assignee_id(id, name, email)")
    .eq("project_id", projectId).is("parent_task_id", null)
    .order("position").order("id");
  if (error) return res.status(500).json({ error: error.message });

  const ids = tasks.map((t) => t.id);
  const [{ data: subs }, { data: items }, { data: deps }] = ids.length
    ? await Promise.all([
        supabase.from("tasks").select("parent_task_id, status").in("parent_task_id", ids),
        supabase.from("task_checklist_items").select("task_id, done").in("task_id", ids),
        supabase.from("task_dependencies").select("task_id, blocker:tasks!blocked_by_id(status)").in("task_id", ids),
      ])
    : [{ data: [] }, { data: [] }, { data: [] }];

  const membership = await getMembership(id, req.user.id);
  const values = await fieldValuesFor(ids);
  const { data: fields } = await supabase.from("project_fields").select("*").eq("project_id", projectId).order("position").order("created_at");
  const cutoff = Date.now() - 14 * 86400000; // finished cards stay on the board for two weeks
  res.json({
    project,
    statuses,
    can_edit_columns: membership?.role === "admin",
    fields: fields || [],
    tasks: tasks
      .map((t) => {
        const col = columnFor(t, statuses);
        const mySubs = (subs || []).filter((x) => x.parent_task_id === t.id);
        const myItems = (items || []).filter((x) => x.task_id === t.id);
        return {
          ...t,
          column_id: col?.id,
          subtasks: { total: mySubs.length, done: mySubs.filter((x) => x.status === "Done").length },
          checklist: { total: myItems.length, done: myItems.filter((x) => x.done).length },
          blocked: (deps || []).some((d) => d.task_id === t.id && d.blocker && d.blocker.status !== "Done"),
          fields: values[t.id] || {},
        };
      })
      .filter((t) => !doneIds.includes(t.column_id) || !t.completed_at || new Date(t.completed_at).getTime() > cutoff),
  });
};

// PUT /teams/:id/projects/:projectId/board/move { status_id, ids: [taskId, ...] }
// The cards of one column in their new order (cards you can't edit are skipped).
export const moveOnBoard = async (req, res) => {
  const { id, projectId } = req.params;
  const project = await projectInTeam(id, projectId);
  if (!project || !(await canUseProject(req.user.id, projectId))) return res.status(404).json({ error: "Project not found" });
  const { status_id: statusId, ids } = req.body;
  if (!Array.isArray(ids) || ids.length > 500) return res.status(400).json({ error: "ids are required" });
  const statuses = await ensureStatuses(projectId);
  const col = statuses.find((s) => s.id === statusId);
  if (!col) return res.status(400).json({ error: "That column isn't in this project" });

  const { data: rows } = await supabase.from("tasks").select("*").eq("project_id", projectId).in("id", ids.map(Number));
  let updated = 0;
  for (const row of rows || []) {
    if (!(await taskAccess(row, req.user.id)).canEdit) continue;
    const position = ids.map(Number).indexOf(row.id);
    const changes = { position, updated_at: new Date().toISOString() };
    if (row.status_id !== col.id) Object.assign(changes, { status_id: col.id, status: legacyStatus(col.category) });
    await supabase.from("tasks").update(changes).eq("id", row.id);
    updated++;
  }
  res.json({ success: true, updated });
  publishToTeam(id, "task", {});
};

// PUT /teams/:id/projects/:projectId/statuses { statuses: [{ id?, name, category, color }] } — lead/admin
// Saves the whole list in order. A removed column's cards move to the first column of the same kind.
export const saveProjectStatuses = async (req, res) => {
  const { id, projectId } = req.params;
  const membership = await getMembership(id, req.user.id);
  if (membership?.role !== "admin") return res.status(403).json({ error: "Only the team lead or an admin edits columns" });
  const project = await projectInTeam(id, projectId);
  if (!project) return res.status(404).json({ error: "Project not found" });

  const list = req.body.statuses;
  if (!Array.isArray(list) || !list.length || list.length > 12) return res.status(400).json({ error: "Between 1 and 12 columns" });
  const clean = [];
  for (const s of list) {
    const name = String(s?.name || "").trim().slice(0, 40);
    if (!name) return res.status(400).json({ error: "Every column needs a name" });
    if (!CATEGORIES.includes(s.category)) return res.status(400).json({ error: "Column kind must be todo, in_progress or done" });
    clean.push({ id: s.id || null, name, category: s.category, color: COLOR_RE.test(s.color || "") ? s.color : "#6b7280" });
  }
  if (!clean.some((s) => s.category === "done")) return res.status(400).json({ error: "Keep at least one Done column" });

  const current = await ensureStatuses(projectId);
  const keepIds = new Set(clean.filter((s) => s.id).map((s) => s.id));
  for (const s of clean) if (s.id && !current.some((c) => c.id === s.id)) return res.status(400).json({ error: "Unknown column" });

  const saved = [];
  for (const [position, s] of clean.entries()) {
    const row = { name: s.name, category: s.category, color: s.color, position };
    const { data } = s.id
      ? await supabase.from("project_statuses").update(row).eq("id", s.id).select().single()
      : await supabase.from("project_statuses").insert([{ ...row, project_id: projectId }]).select().single();
    saved.push(data);
  }
  // cards in removed columns move to the first remaining column of the same kind
  for (const gone of current.filter((c) => !keepIds.has(c.id))) {
    const target = saved.find((s) => s.category === gone.category) || saved[0];
    await supabase.from("tasks").update({ status_id: target.id, status: legacyStatus(target.category) }).eq("status_id", gone.id);
    await supabase.from("project_statuses").delete().eq("id", gone.id);
  }
  // a column whose kind changed: keep its cards' plain status in step
  for (const s of saved) {
    const before = current.find((c) => c.id === s.id);
    if (before && before.category !== s.category)
      await supabase.from("tasks").update({ status: legacyStatus(s.category) }).eq("status_id", s.id);
  }
  await audit(req, project.company_id, "project.columns_changed", "project", projectId, { columns: saved.map((s) => s.name) });
  res.json(saved);
  publishToTeam(id, "project", {});
};

// ── People on a project (guests, and people from outside the team) ─────────

// GET /teams/:id/projects/:projectId/members
export const getProjectMembers = async (req, res) => {
  const { id, projectId } = req.params;
  if (!(await getMembership(id, req.user.id))) return res.status(403).json({ error: "Not a team member" });
  const { data: project } = await supabase.from("projects").select("id").eq("id", projectId).eq("team_id", id).maybeSingle();
  if (!project) return res.status(404).json({ error: "Project not found" });
  const { data, error } = await supabase
    .from("project_members").select("user_id, access, created_at, users!user_id(name, email)")
    .eq("project_id", projectId).order("created_at");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map(({ users, user_id, ...m }) => ({ ...m, id: user_id, name: users?.name, email: users?.email })));
};

// POST /teams/:id/projects/:projectId/members { user_id, access? } — team lead / admin
export const addProjectMember = async (req, res) => {
  const { id, projectId } = req.params;
  const membership = await getMembership(id, req.user.id);
  if (membership?.role !== "admin") return res.status(403).json({ error: "Only the team lead or an admin adds people" });
  const { data: project } = await supabase
    .from("projects").select("id, name, company_id").eq("id", projectId).eq("team_id", id).maybeSingle();
  if (!project) return res.status(404).json({ error: "Project not found" });
  const target = await getCompanyMember(project.company_id, req.body.user_id);
  if (!target) return res.status(400).json({ error: "Pick someone in this company (invite guests from Company → Invites)" });
  const access = req.body.access === "view" ? "view" : "edit";
  const { error } = await supabase.from("project_members")
    .upsert([{ project_id: projectId, user_id: target.user_id, access, added_by: req.user.id }], { onConflict: "project_id,user_id" });
  if (error) return res.status(500).json({ error: error.message });
  await audit(req, project.company_id, "project.member_added", "project", projectId, { user_id: target.user_id, name: project.name });
  res.status(201).json({ success: true });
  publishToTeam(id, "project", {});
};

// DELETE /teams/:id/projects/:projectId/members/:userId
export const removeProjectMember = async (req, res) => {
  const { id, projectId, userId } = req.params;
  const membership = await getMembership(id, req.user.id);
  if (membership?.role !== "admin") return res.status(403).json({ error: "Only the team lead or an admin removes people" });
  const { data: project } = await supabase
    .from("projects").select("id, company_id").eq("id", projectId).eq("team_id", id).maybeSingle();
  if (!project) return res.status(404).json({ error: "Project not found" });
  await supabase.from("project_members").delete().eq("project_id", projectId).eq("user_id", userId);
  await audit(req, project.company_id, "project.member_removed", "project", projectId, { user_id: userId });
  res.json({ success: true });
  publishToTeam(id, "project", {});
};

// ── Team goals ───────────────────────────────────────────────────────────────
// Count Done tasks from every member (optionally only one project's).

// GET /teams/:id/goals
export const getTeamGoals = async (req, res) => {
  const { id } = req.params;
  if (!(await getMembership(id, req.user.id))) return res.status(403).json({ error: "Not a team member" });
  const { data, error } = await supabase
    .from("goals")
    .select("*, projects(id, name, color)")
    .eq("team_id", id)
    .order("created_at");
  if (error) return res.status(500).json({ error: error.message });
  res.json(await withProgress(data, await teamScope(id), req.user.timezone));
};

// POST /teams/:id/goals (admin) { title, period, target, project_id? }
export const createTeamGoal = async (req, res) => {
  const { id } = req.params;
  const membership = await getMembership(id, req.user.id);
  if (membership?.role !== "admin") return res.status(403).json({ error: "Admin only" });

  const title = String(req.body.title || "").trim();
  const target = Number(req.body.target);
  if (!title) return res.status(400).json({ error: "Title is required" });
  if (!["week", "month"].includes(req.body.period)) return res.status(400).json({ error: "Period must be week or month" });
  if (!Number.isInteger(target) || target < 1) return res.status(400).json({ error: "Target must be a whole number above 0" });

  let projectId = req.body.project_id || null;
  if (projectId) {
    const { data: p } = await supabase.from("projects").select("id").eq("id", projectId).eq("team_id", id).maybeSingle();
    if (!p) return res.status(400).json({ error: "That project isn't in this team" });
  }

  const { data, error } = await supabase
    .from("goals")
    .insert([{ title, target, period: req.body.period, project_id: projectId, team_id: id, user_id: req.user.id, company_id: (await teamScope(id)).companyId }])
    .select("*, projects(id, name, color)")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  const [goal] = await withProgress([data], await teamScope(id), req.user.timezone);
  res.status(201).json(goal);
  publishToTeam(id, "goal", {});
};

// DELETE /teams/:id/goals/:goalId (admin)
export const deleteTeamGoal = async (req, res) => {
  const { id, goalId } = req.params;
  const membership = await getMembership(id, req.user.id);
  if (membership?.role !== "admin") return res.status(403).json({ error: "Admin only" });
  await supabase.from("goals").delete().eq("id", goalId).eq("team_id", id);
  res.json({ success: true });
  publishToTeam(id, "goal", {});
};
