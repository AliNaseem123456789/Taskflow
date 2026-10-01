// controllers/structureController.js
// How a company is laid out: departments, which teams sit where, and the org chart.
import { supabase } from "../config/supabase.js";
import { can, getCompanyMember } from "../utils/permissions.js";
import { audit } from "../utils/audit.js";

// my membership or a 404 (same message as the company routes, so ids don't leak)
const memberOr404 = async (req, res) => {
  const member = await getCompanyMember(req.params.id, req.user.id);
  if (!member) res.status(404).json({ error: "Company not found" });
  return member;
};

const loadDepartment = async (companyId, deptId) => {
  const { data } = await supabase
    .from("departments").select("*").eq("id", deptId).eq("company_id", companyId).maybeSingle();
  return data;
};

// Walk up a parent chain; true if `startId` eventually reaches `targetId` (would make a loop)
const reaches = async (table, startId, targetId, parentCol) => {
  let cursor = startId;
  for (let depth = 0; cursor && depth < 50; depth++) {
    if (cursor === targetId) return true;
    const { data } = await supabase.from(table).select(parentCol).eq("id", cursor).maybeSingle();
    cursor = data?.[parentCol];
  }
  return false;
};

// A department head needs the power to run it: manager, admin or owner
const checkHead = async (companyId, userId) => {
  if (!userId) return null;
  const head = await getCompanyMember(companyId, userId);
  if (!head) return "The head must be in this company";
  if (!["owner", "admin", "manager"].includes(head.role)) return "Make them a Manager first, then set them as head";
  return null;
};

// ── GET /companies/:id/departments ───────────────────────────────────────────
export const getDepartments = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  if (!can(member, "directory.view")) return res.status(403).json({ error: "Guests can't see the company structure" });

  const [{ data: depts, error }, { data: teams }, { data: people }] = await Promise.all([
    supabase.from("departments").select("id, name, parent_id, head_user_id, created_at")
      .eq("company_id", req.params.id).order("name"),
    supabase.from("teams").select("id, department_id").eq("company_id", req.params.id),
    supabase.from("company_members").select("department_id")
      .eq("company_id", req.params.id).eq("status", "active"),
  ]);
  if (error) return res.status(500).json({ error: error.message });
  res.json(depts.map((d) => ({
    ...d,
    team_count: (teams || []).filter((t) => t.department_id === d.id).length,
    member_count: (people || []).filter((p) => p.department_id === d.id).length,
  })));
};

// ── POST /companies/:id/departments { name, parent_id?, head_user_id? } ───────
export const createDepartment = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  if (!can(member, "structure.edit")) return res.status(403).json({ error: "Only admins change the structure" });

  const name = String(req.body.name || "").trim();
  if (!name || name.length > 80) return res.status(400).json({ error: "Department name must be 1-80 characters" });
  const parentId = req.body.parent_id || null;
  if (parentId && !(await loadDepartment(req.params.id, parentId)))
    return res.status(400).json({ error: "Parent department not found" });
  const headId = req.body.head_user_id || null;
  const headProblem = await checkHead(req.params.id, headId);
  if (headProblem) return res.status(400).json({ error: headProblem });

  const { data, error } = await supabase
    .from("departments")
    .insert([{ company_id: req.params.id, name, parent_id: parentId, head_user_id: headId }])
    .select().single();
  if (error?.code === "23505") return res.status(400).json({ error: "There's already a department with that name" });
  if (error) return res.status(500).json({ error: error.message });

  // the head works in the department they run
  if (headId) await supabase.from("company_members").update({ department_id: data.id })
    .eq("company_id", req.params.id).eq("user_id", headId);
  await audit(req, req.params.id, "department.created", "department", data.id, { name });
  res.status(201).json(data);
};

// ── PUT /companies/:id/departments/:deptId { name?, parent_id?, head_user_id? } ─
export const updateDepartment = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  if (!can(member, "structure.edit")) return res.status(403).json({ error: "Only admins change the structure" });
  const dept = await loadDepartment(req.params.id, req.params.deptId);
  if (!dept) return res.status(404).json({ error: "Department not found" });

  const updates = {};
  if (req.body.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name || name.length > 80) return res.status(400).json({ error: "Department name must be 1-80 characters" });
    updates.name = name;
  }
  if (req.body.parent_id !== undefined) {
    const parentId = req.body.parent_id || null;
    if (parentId) {
      if (!(await loadDepartment(req.params.id, parentId))) return res.status(400).json({ error: "Parent department not found" });
      if (await reaches("departments", parentId, dept.id, "parent_id"))
        return res.status(400).json({ error: "A department can't sit inside itself" });
    }
    updates.parent_id = parentId;
  }
  if (req.body.head_user_id !== undefined) {
    const headId = req.body.head_user_id || null;
    const headProblem = await checkHead(req.params.id, headId);
    if (headProblem) return res.status(400).json({ error: headProblem });
    updates.head_user_id = headId;
  }
  if (!Object.keys(updates).length) return res.status(400).json({ error: "Nothing to update" });

  const { data, error } = await supabase.from("departments").update(updates).eq("id", dept.id).select().single();
  if (error?.code === "23505") return res.status(400).json({ error: "There's already a department with that name" });
  if (error) return res.status(500).json({ error: error.message });
  if (updates.head_user_id) await supabase.from("company_members").update({ department_id: dept.id })
    .eq("company_id", req.params.id).eq("user_id", updates.head_user_id);
  await audit(req, req.params.id, "department.updated", "department", dept.id, updates);
  res.json(data);
};

// ── DELETE /companies/:id/departments/:deptId ────────────────────────────────
// Teams, people and sub-departments inside move up to the parent (or to no department).
export const deleteDepartment = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  if (!can(member, "structure.edit")) return res.status(403).json({ error: "Only admins change the structure" });
  const dept = await loadDepartment(req.params.id, req.params.deptId);
  if (!dept) return res.status(404).json({ error: "Department not found" });

  const up = dept.parent_id || null;
  await Promise.all([
    supabase.from("teams").update({ department_id: up }).eq("department_id", dept.id),
    supabase.from("company_members").update({ department_id: up }).eq("department_id", dept.id),
    supabase.from("departments").update({ parent_id: up }).eq("parent_id", dept.id),
  ]);
  await supabase.from("departments").delete().eq("id", dept.id);
  await audit(req, req.params.id, "department.deleted", "department", dept.id, { name: dept.name });
  res.json({ success: true });
};

// ── PUT /companies/:id/teams/:teamId/placement { department_id?, parent_team_id? } ─
export const placeTeam = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  if (!can(member, "structure.edit")) return res.status(403).json({ error: "Only admins change the structure" });
  const { data: team } = await supabase
    .from("teams").select("id, name").eq("id", req.params.teamId).eq("company_id", req.params.id).maybeSingle();
  if (!team) return res.status(404).json({ error: "Team not found" });

  const updates = {};
  if (req.body.department_id !== undefined) {
    const deptId = req.body.department_id || null;
    if (deptId && !(await loadDepartment(req.params.id, deptId))) return res.status(400).json({ error: "Department not found" });
    updates.department_id = deptId;
  }
  if (req.body.parent_team_id !== undefined) {
    const parentId = req.body.parent_team_id || null;
    if (parentId) {
      const { data: parent } = await supabase
        .from("teams").select("id").eq("id", parentId).eq("company_id", req.params.id).maybeSingle();
      if (!parent) return res.status(400).json({ error: "Parent team not found" });
      if (await reaches("teams", parentId, team.id, "parent_team_id"))
        return res.status(400).json({ error: "A team can't sit inside itself" });
    }
    updates.parent_team_id = parentId;
  }
  if (!Object.keys(updates).length) return res.status(400).json({ error: "Nothing to update" });

  const { error } = await supabase.from("teams").update(updates).eq("id", team.id);
  if (error) return res.status(500).json({ error: error.message });
  await audit(req, req.params.id, "team.moved", "team", team.id, { name: team.name, ...updates });
  res.json({ success: true });
};

// ── GET /companies/:id/org — everything the org chart and directory need ──────
export const getOrgChart = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  if (!can(member, "directory.view")) return res.status(403).json({ error: "Guests can't see the company structure" });

  const [{ data: depts }, { data: teams }, { data: teamMembers }, { data: people, error }] = await Promise.all([
    supabase.from("departments").select("id, name, parent_id, head_user_id").eq("company_id", req.params.id).order("name"),
    supabase.from("teams").select("id, name, department_id, parent_team_id").eq("company_id", req.params.id).order("name"),
    supabase.from("team_members").select("team_id, user_id, role, teams!inner(company_id)").eq("teams.company_id", req.params.id),
    supabase.from("company_members")
      .select("user_id, role, job_title, level, department_id, manager_id, skills, users!user_id(name, email)")
      .eq("company_id", req.params.id).eq("status", "active"),
  ]);
  if (error) return res.status(500).json({ error: error.message });

  const tm = teamMembers || [];
  res.json({
    departments: depts || [],
    teams: (teams || []).map((t) => ({
      ...t,
      members: tm.filter((m) => m.team_id === t.id).map((m) => ({ id: m.user_id, role: m.role })),
    })),
    people: people.map(({ users, user_id, ...p }) => ({
      ...p,
      id: user_id,
      name: users?.name,
      email: users?.email,
      team_ids: tm.filter((m) => m.user_id === user_id).map((m) => m.team_id),
    })),
  });
};
