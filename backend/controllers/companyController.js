import { supabase } from "../config/supabase.js";
import { can, getCompanyMember, COMPANY_ROLES } from "../utils/permissions.js";
import { audit } from "../utils/audit.js";
import { WORK_TYPES } from "../utils/workTypes.js";
import { handOverWork } from "./companyLifeController.js";
import { awayToday } from "./timeOffController.js";

// Optional hand-over when someone goes: { reassign_to } must be an active member who can take work
const readHandOver = async (companyId, body, leavingId) => {
  const to = body?.reassign_to;
  if (!to) return { to: null };
  const m = await getCompanyMember(companyId, to);
  if (!m || to === leavingId || ["viewer", "guest"].includes(m.role)) return { error: "Pick someone in the company to take over the work" };
  return { to };
};

const slugify = (name) =>
  name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "company";

const COMPANY_FIELDS = "id, name, slug, work_type, email_domain, domain_join, created_at";

// Load the company + my membership, or answer 403/404. Returns null when it answered.
const loadForMember = async (req, res) => {
  const member = await getCompanyMember(req.params.id, req.user.id);
  if (!member) {
    res.status(404).json({ error: "Company not found" });
    return null;
  }
  const { data: company } = await supabase.from("companies").select(COMPANY_FIELDS).eq("id", req.params.id).single();
  return { company, member };
};

// ── GET /companies — every company I'm in ─────────────────────────────────────
export const getMyCompanies = async (req, res) => {
  const { data, error } = await supabase
    .from("company_members")
    .select(`role, job_title, companies(${COMPANY_FIELDS})`)
    .eq("user_id", req.user.id)
    .eq("status", "active");
  if (error) return res.status(500).json({ error: error.message });
  res.json(
    data
      .map((m) => ({ ...m.companies, role: m.role, job_title: m.job_title }))
      .sort((a, b) => a.name.localeCompare(b.name))
  );
};

// ── POST /companies { name, work_type } ───────────────────────────────────────
export const createCompany = async (req, res) => {
  const name = String(req.body.name || "").trim();
  if (!name) return res.status(400).json({ error: "Company name is required" });
  if (name.length > 80) return res.status(400).json({ error: "Name is too long" });
  const workType = req.body.work_type || "general";
  if (!WORK_TYPES[workType]) return res.status(400).json({ error: "Unknown kind of work" });

  // decided: only verified emails can create companies (stops spam)
  const { data: me } = await supabase.from("users").select("email_verified").eq("id", req.user.id).single();
  if (me?.email_verified === false)
    return res.status(403).json({ error: "Verify your email before creating a company" });

  const base = slugify(name);
  let company = null;
  for (let attempt = 0; attempt < 5 && !company; attempt++) {
    const slug = attempt ? `${base}-${Math.random().toString(36).slice(2, 6)}` : base;
    const { data, error } = await supabase
      .from("companies")
      .insert([{ name, slug, work_type: workType, created_by: req.user.id }])
      .select(COMPANY_FIELDS)
      .single();
    if (!error) company = data;
    else if (error.code !== "23505") return res.status(500).json({ error: error.message });
  }
  if (!company) return res.status(500).json({ error: "Could not create the company, try another name" });

  await supabase.from("company_members").insert([{ company_id: company.id, user_id: req.user.id, role: "owner" }]);
  await audit(req, company.id, "company.created", "company", company.id, { name });
  res.status(201).json({ ...company, role: "owner" });
};

// ── GET /companies/:id ────────────────────────────────────────────────────────
export const getCompany = async (req, res) => {
  const ctx = await loadForMember(req, res);
  if (!ctx) return;
  const [{ count: members }, { count: teams }] = await Promise.all([
    supabase.from("company_members").select("id", { count: "exact", head: true })
      .eq("company_id", req.params.id).eq("status", "active"),
    supabase.from("teams").select("id", { count: "exact", head: true }).eq("company_id", req.params.id),
  ]);
  res.json({ ...ctx.company, my_role: ctx.member.role, member_count: members || 0, team_count: teams || 0 });
};

// ── PUT /companies/:id { name, work_type, email_domain, domain_join } ────────
export const updateCompany = async (req, res) => {
  const ctx = await loadForMember(req, res);
  if (!ctx) return;
  if (!can(ctx.member, "company.settings")) return res.status(403).json({ error: "Admins only" });

  const updates = {};
  if (req.body.name !== undefined) {
    const name = String(req.body.name).trim();
    if (!name || name.length > 80) return res.status(400).json({ error: "Name must be 1-80 characters" });
    updates.name = name;
  }
  if (req.body.work_type !== undefined) {
    if (!WORK_TYPES[req.body.work_type]) return res.status(400).json({ error: "Unknown kind of work" });
    updates.work_type = req.body.work_type;
  }
  if (req.body.email_domain !== undefined) {
    const domain = String(req.body.email_domain || "").trim().toLowerCase().replace(/^@/, "");
    if (domain && !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain))
      return res.status(400).json({ error: "Domain looks like acme.com" });
    // public mail providers would let anyone in
    if (["gmail.com", "yahoo.com", "outlook.com", "hotmail.com", "icloud.com", "proton.me"].includes(domain))
      return res.status(400).json({ error: "Use your company's own domain, not a public email provider" });
    updates.email_domain = domain || null;
  }
  if (req.body.domain_join !== undefined) {
    if (!["off", "request", "auto"].includes(req.body.domain_join))
      return res.status(400).json({ error: "domain_join must be off, request or auto" });
    updates.domain_join = req.body.domain_join;
  }

  const { data, error } = await supabase
    .from("companies").update(updates).eq("id", req.params.id).select(COMPANY_FIELDS).single();
  if (error) return res.status(500).json({ error: error.message });
  await audit(req, req.params.id, "company.updated", "company", req.params.id, updates);
  res.json(data);
};

// ── DELETE /companies/:id { confirm: "<company name>" } — owner only ──────────
export const deleteCompany = async (req, res) => {
  const ctx = await loadForMember(req, res);
  if (!ctx) return;
  if (!can(ctx.member, "company.delete")) return res.status(403).json({ error: "Only the owner can delete the company" });
  if (req.body?.confirm !== ctx.company.name)
    return res.status(400).json({ error: "Type the company name to confirm" });
  await supabase.from("companies").delete().eq("id", req.params.id);
  res.json({ success: true });
};

// ── GET /companies/:id/members ───────────────────────────────────────────────
export const getMembers = async (req, res) => {
  const ctx = await loadForMember(req, res);
  if (!ctx) return;
  if (!can(ctx.member, "directory.view")) return res.status(403).json({ error: "Guests can't see the member list" });

  const includeFormer = req.query.former === "1" && can(ctx.member, "members.remove");
  let query = supabase
    .from("company_members")
    .select("user_id, role, job_title, level, department_id, manager_id, skills, status, joined_at, left_at, users!user_id(id, name, email, timezone)")
    .eq("company_id", req.params.id);
  if (!includeFormer) query = query.eq("status", "active");
  const { data, error } = await query.order("joined_at");
  if (error) return res.status(500).json({ error: error.message });
  const away = await awayToday(req.params.id); // so "assign to" pickers can say who's off
  res.json(data.map(({ users, ...m }) => ({
    ...m, id: users.id, name: users.name, email: users.email, timezone: users.timezone, away_until: away[users.id] || null,
  })));
};

// ── PUT /companies/:id/members/:userId { role?, job_title?, level?, manager_id?, skills? }
export const updateMember = async (req, res) => {
  const ctx = await loadForMember(req, res);
  if (!ctx) return;
  const target = await getCompanyMember(req.params.id, req.params.userId);
  if (!target) return res.status(404).json({ error: "Member not found" });
  const isSelf = req.params.userId === req.user.id;

  const updates = {};
  if (req.body.role !== undefined) {
    if (!can(ctx.member, "members.change_role")) return res.status(403).json({ error: "Only admins change roles" });
    if (!COMPANY_ROLES.includes(req.body.role)) return res.status(400).json({ error: "Unknown role" });
    if (req.body.role === "owner" || target.role === "owner")
      return res.status(400).json({ error: "Use 'transfer ownership' to change the owner" });
    if (target.role === "admin" && ctx.member.role !== "owner")
      return res.status(403).json({ error: "Only the owner changes an admin's role" });
    updates.role = req.body.role;
  }

  // labels: admins/managers for anyone; people can edit their own title and skills
  const labelEdit = can(ctx.member, "members.edit_profile") || isSelf;
  for (const key of ["job_title", "level"]) {
    if (req.body[key] === undefined) continue;
    if (!labelEdit) return res.status(403).json({ error: "You can't edit this profile" });
    updates[key] = String(req.body[key] || "").trim().slice(0, 80) || null;
  }
  if (req.body.skills !== undefined) {
    if (!labelEdit) return res.status(403).json({ error: "You can't edit this profile" });
    if (!Array.isArray(req.body.skills)) return res.status(400).json({ error: "skills must be a list" });
    updates.skills = [...new Set(req.body.skills.map((s) => String(s).trim().toLowerCase()).filter(Boolean))].slice(0, 30);
  }
  if (req.body.department_id !== undefined) {
    if (!can(ctx.member, "members.edit_profile")) return res.status(403).json({ error: "Only admins and managers move people between departments" });
    const deptId = req.body.department_id || null;
    if (deptId) {
      const { data: dept } = await supabase
        .from("departments").select("id").eq("id", deptId).eq("company_id", req.params.id).maybeSingle();
      if (!dept) return res.status(400).json({ error: "Department not found" });
    }
    updates.department_id = deptId;
  }
  if (req.body.manager_id !== undefined) {
    if (!can(ctx.member, "members.edit_profile")) return res.status(403).json({ error: "Only admins and managers set managers" });
    const managerId = req.body.manager_id || null;
    if (managerId === req.params.userId) return res.status(400).json({ error: "Someone can't manage themselves" });
    if (managerId) {
      if (!(await getCompanyMember(req.params.id, managerId)))
        return res.status(400).json({ error: "The manager must be in this company" });
      // no loops: walk up from the new manager
      let cursor = managerId;
      for (let depth = 0; cursor && depth < 50; depth++) {
        if (cursor === req.params.userId) return res.status(400).json({ error: "That would make a reporting loop" });
        const up = await getCompanyMember(req.params.id, cursor);
        cursor = up?.manager_id;
      }
    }
    updates.manager_id = managerId;
  }
  if (!Object.keys(updates).length) return res.status(400).json({ error: "Nothing to update" });

  const { error } = await supabase
    .from("company_members").update(updates)
    .eq("company_id", req.params.id).eq("user_id", req.params.userId);
  if (error) return res.status(500).json({ error: error.message });
  await audit(req, req.params.id, updates.role ? "member.role_changed" : "member.updated", "user", req.params.userId,
    { ...updates, before: updates.role ? target.role : undefined });
  res.json({ success: true });
};

// Take someone out of a company. Their tasks stay (shown as "former member").
const endMembership = async (companyId, userId) => {
  const { data: teams } = await supabase.from("teams").select("id").eq("company_id", companyId);
  const teamIds = (teams || []).map((t) => t.id);
  if (teamIds.length) await supabase.from("team_members").delete().eq("user_id", userId).in("team_id", teamIds);
  const { data: projects } = await supabase.from("projects").select("id").eq("company_id", companyId);
  const projectIds = (projects || []).map((p) => p.id);
  if (projectIds.length) await supabase.from("project_members").delete().eq("user_id", userId).in("project_id", projectIds);
  await supabase
    .from("company_members")
    .update({ status: "left", left_at: new Date().toISOString() })
    .eq("company_id", companyId).eq("user_id", userId);
};

// ── DELETE /companies/:id/members/:userId — admin removes someone ─────────────
export const removeMember = async (req, res) => {
  const ctx = await loadForMember(req, res);
  if (!ctx) return;
  if (!can(ctx.member, "members.remove")) return res.status(403).json({ error: "Admins only" });
  const target = await getCompanyMember(req.params.id, req.params.userId);
  if (!target) return res.status(404).json({ error: "Member not found" });
  if (target.role === "owner") return res.status(400).json({ error: "The owner can't be removed" });
  if (target.role === "admin" && ctx.member.role !== "owner")
    return res.status(403).json({ error: "Only the owner removes an admin" });
  const handOver = await readHandOver(req.params.id, req.body, req.params.userId);
  if (handOver.error) return res.status(400).json({ error: handOver.error });

  const moved = handOver.to ? await handOverWork(req.params.id, req.params.userId, handOver.to) : 0;
  await endMembership(req.params.id, req.params.userId);
  await audit(req, req.params.id, "member.removed", "user", req.params.userId, { role: target.role, tasks_handed_over: moved });
  res.json({ success: true, tasks_handed_over: moved });
};

// ── POST /companies/:id/leave ─────────────────────────────────────────────────
export const leaveCompany = async (req, res) => {
  const ctx = await loadForMember(req, res);
  if (!ctx) return;
  if (ctx.member.role === "owner")
    return res.status(400).json({ error: "Hand ownership to someone else before leaving" });
  const handOver = await readHandOver(req.params.id, req.body, req.user.id);
  if (handOver.error) return res.status(400).json({ error: handOver.error });
  const moved = handOver.to ? await handOverWork(req.params.id, req.user.id, handOver.to) : 0;
  await endMembership(req.params.id, req.user.id);
  await audit(req, req.params.id, "member.left", "user", req.user.id, { tasks_handed_over: moved });
  res.json({ success: true, tasks_handed_over: moved });
};

// ── POST /companies/:id/transfer-ownership { user_id } — owner only ───────────
export const transferOwnership = async (req, res) => {
  const ctx = await loadForMember(req, res);
  if (!ctx) return;
  if (!can(ctx.member, "company.transfer_ownership")) return res.status(403).json({ error: "Only the owner can do this" });
  const target = await getCompanyMember(req.params.id, req.body.user_id);
  if (!target || req.body.user_id === req.user.id) return res.status(400).json({ error: "Pick another active member" });
  if (["guest", "viewer"].includes(target.role))
    return res.status(400).json({ error: "Guests and viewers can't own the company" });

  await supabase.from("company_members").update({ role: "owner" })
    .eq("company_id", req.params.id).eq("user_id", req.body.user_id);
  await supabase.from("company_members").update({ role: "admin" })
    .eq("company_id", req.params.id).eq("user_id", req.user.id);
  await audit(req, req.params.id, "company.ownership_transferred", "user", req.body.user_id);
  res.json({ success: true });
};

// ── GET /companies/:id/audit — admins ─────────────────────────────────────────
export const getAuditLog = async (req, res) => {
  const ctx = await loadForMember(req, res);
  if (!ctx) return;
  if (!can(ctx.member, "audit.view")) return res.status(403).json({ error: "Admins only" });
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const { data, error } = await supabase
    .from("audit_logs")
    .select("id, action, resource_type, resource_id, details, created_at, users(id, name, email)")
    .eq("company_id", req.params.id)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map(({ users, ...row }) => ({ ...row, actor: users })));
};

// ── GET /companies/work-types — presets for the create form ──────────────────
export const getWorkTypes = (_req, res) =>
  res.json(Object.entries(WORK_TYPES).map(([key, t]) => ({ key, label: t.label, statuses: t.statuses.map((s) => s.name) })));
