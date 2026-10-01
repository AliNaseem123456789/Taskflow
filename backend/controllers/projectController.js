import { supabase } from "../config/supabase.js";
import { getMembership } from "./teamController.js";
import { normaliseTasks } from "./taskController.js";
import { withProgress } from "./goalController.js";
import { publishToTeam } from "../utils/events.js";
import { getCompanyMember, taskScope } from "../utils/permissions.js";
import { audit } from "../utils/audit.js";

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

  const { data: team } = await supabase.from("teams").select("company_id").eq("id", id).single();
  const { data, error } = await supabase
    .from("projects")
    .insert([{ ...fields, team_id: id, company_id: team.company_id, created_by: req.user.id }])
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: error.message });
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
  res.json(normaliseTasks(data).map((t) => ({ ...t, owner: t.assignee || t.creator })));
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
