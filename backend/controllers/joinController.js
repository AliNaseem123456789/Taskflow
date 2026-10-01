// controllers/joinController.js
// Getting people into a company: email invites, joining by email domain,
// join requests, and onboarding checklists for new joiners.
import crypto from "node:crypto";
import { supabase } from "../config/supabase.js";
import { sendEmail, appLink } from "./emailController.js";
import { notify } from "./notificationController.js";
import { can, getCompanyMember, isCompanyAdmin } from "../utils/permissions.js";
import { audit } from "../utils/audit.js";
import { hashToken } from "../utils/session.js";
import { todayIn, safeTz } from "../utils/time.js";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const memberOr404 = async (req, res) => {
  const member = await getCompanyMember(req.params.id, req.user.id);
  if (!member) res.status(404).json({ error: "Company not found" });
  return member;
};

const findUserByEmail = async (email) => {
  const { data } = await supabase
    .from("users").select("id, name, email, timezone")
    .ilike("email", email.replace(/[\\%_]/g, "\\$&")).maybeSingle();
  return data;
};

const addDays = (isoDate, days) => {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

// ── Onboarding: turn a checklist template into tasks for one person ──────────
export const runOnboarding = async (companyId, templateId, userId, actorId) => {
  let query = supabase.from("onboarding_templates").select("*").eq("company_id", companyId);
  query = templateId ? query.eq("id", templateId) : query.eq("is_default", true);
  const { data: templates } = await query;
  if (!templates?.length) return 0;

  const { data: person } = await supabase.from("users").select("timezone").eq("id", userId).single();
  const today = todayIn(safeTz(person?.timezone));
  const rows = templates.flatMap((t) =>
    (t.items || []).map((item) => ({
      user_id: actorId || t.created_by || userId,
      assignee_id: userId,
      company_id: companyId,
      team_id: t.team_id,
      title: item.title,
      description: `Onboarding: ${t.name}`,
      status: "Doing",
      date_logged: today,
      due_date: addDays(today, Number(item.days) || 0),
    }))
  );
  if (!rows.length) return 0;
  const { error } = await supabase.from("tasks").insert(rows);
  if (error) console.error("onboarding failed:", error.message);
  return error ? 0 : rows.length;
};

// Put someone into a company with a role (+ team / project). Re-activates former
// members; never lowers an existing member's role. Returns true if they are new.
const admit = async ({ companyId, userId, role = "member", teamId, projectId, addedBy }) => {
  const { data: row } = await supabase
    .from("company_members").select("id, status").eq("company_id", companyId).eq("user_id", userId).maybeSingle();
  let isNew = false;
  if (!row) {
    await supabase.from("company_members").insert([{ company_id: companyId, user_id: userId, role }]);
    isNew = true;
  } else if (row.status === "left") {
    await supabase.from("company_members").update({ status: "active", left_at: null, role }).eq("id", row.id);
    isNew = true;
  }
  if (teamId) {
    const { data: onTeam } = await supabase
      .from("team_members").select("id").eq("team_id", teamId).eq("user_id", userId).maybeSingle();
    if (!onTeam) await supabase.from("team_members").insert([{ team_id: teamId, user_id: userId, role: "member" }]);
  }
  if (projectId) {
    await supabase.from("project_members")
      .upsert([{ project_id: projectId, user_id: userId, access: "edit", added_by: addedBy }], { onConflict: "project_id,user_id" });
  }
  return isNew;
};

// People to tell about a join request: admins and managers
const approverIds = async (companyId) => {
  const { data } = await supabase
    .from("company_members").select("user_id")
    .eq("company_id", companyId).eq("status", "active").in("role", ["owner", "admin", "manager"]);
  return (data || []).map((m) => m.user_id);
};

// ═════════════════════════════ Invites ═════════════════════════════════════

// POST /companies/:id/invites { email, role, team_id?, project_id?, template_id? }
export const createCompanyInvite = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  if (!can(member, "members.invite")) return res.status(403).json({ error: "Only admins and managers invite people" });

  // invite by email, or by user id from someone's public profile (their email stays hidden)
  const byUserId = !req.body.email && req.body.user_id;
  let email = String(req.body.email || "").trim().toLowerCase();
  if (byUserId) {
    const { data: prof } = UUID_RE.test(req.body.user_id)
      ? await supabase.from("public_profiles").select("is_public, users!user_id(email)").eq("user_id", req.body.user_id).maybeSingle()
      : { data: null };
    if (!prof?.is_public) return res.status(404).json({ error: "Profile not found" });
    email = prof.users.email.toLowerCase();
  }
  if (!EMAIL_RE.test(email)) return res.status(400).json({ error: "Enter a valid email" });
  const role = req.body.role || "member";
  if (!["admin", "manager", "member", "guest", "viewer"].includes(role)) return res.status(400).json({ error: "Unknown role" });
  // managers bring in people below them; only admins hand out admin/manager
  if (["admin", "manager"].includes(role) && !isCompanyAdmin(member))
    return res.status(403).json({ error: "Only admins invite admins and managers" });

  const teamId = req.body.team_id || null;
  const projectId = req.body.project_id || null;
  const templateId = req.body.template_id || null;
  for (const v of [teamId, projectId, templateId])
    if (v && !UUID_RE.test(v)) return res.status(400).json({ error: "Invalid id" });
  if (teamId) {
    const { data } = await supabase.from("teams").select("id").eq("id", teamId).eq("company_id", req.params.id).maybeSingle();
    if (!data) return res.status(400).json({ error: "Team not found" });
  }
  if (projectId) {
    const { data } = await supabase.from("projects").select("id").eq("id", projectId).eq("company_id", req.params.id).maybeSingle();
    if (!data) return res.status(400).json({ error: "Project not found" });
  }
  if (role === "guest" && !projectId) return res.status(400).json({ error: "Pick the project the guest will work on" });
  if (role === "guest" && teamId) return res.status(400).json({ error: "Guests join a project, not a team" });
  if (templateId) {
    const { data } = await supabase.from("onboarding_templates").select("id").eq("id", templateId).eq("company_id", req.params.id).maybeSingle();
    if (!data) return res.status(400).json({ error: "Onboarding checklist not found" });
  }

  const existing = await findUserByEmail(email);
  if (existing && (await getCompanyMember(req.params.id, existing.id)) && !teamId && !projectId)
    return res.status(400).json({ error: "That person is already in the company" });

  const { invite, error, sent } = await issueInvite({
    companyId: req.params.id, email, role, teamId, projectId, templateId, actorId: req.user.id, existing, viaProfile: !!byUserId,
  });
  if (error) return res.status(500).json({ error });
  await audit(req, req.params.id, "invite.sent", "invite", invite.id, { email: byUserId ? "(public profile)" : email, role });
  // inviting from a public profile never reveals the person's email
  res.status(201).json({ ...invite, email: byUserId ? maskEmail(email) : email, email_sent: sent });
};

const maskEmail = (e) => e.replace(/^(.)[^@]*(@.).*$/, "$1•••$2•••");

// Create an invite, email the link and (if they have an account) notify them.
// Used for normal invites, invites from a public profile, and hires from public job posts.
export const issueInvite = async ({ companyId, email, role = "member", teamId = null, projectId = null, templateId = null, actorId, existing, viaProfile = false, waitForEmail = true }) => {
  const raw = crypto.randomBytes(24).toString("hex");
  const { data: invite, error } = await supabase
    .from("company_invites")
    .insert([{
      company_id: companyId, email, role, team_id: teamId, project_id: projectId, template_id: templateId,
      token_hash: hashToken(raw), invited_by: actorId, via_profile: viaProfile,
      expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
    }])
    .select("id, email, role, team_id, project_id, expires_at, created_at")
    .single();
  if (error) return { error: error.message };

  const [{ data: company }, { data: me }] = await Promise.all([
    supabase.from("companies").select("name").eq("id", companyId).single(),
    supabase.from("users").select("name, email").eq("id", actorId).single(),
  ]);
  const inviter = me?.name || me?.email || "Someone";
  const link = appLink(`/join-company?token=${raw}`);
  const sending = sendEmail(
    email,
    `${inviter} invited you to ${company.name}`,
    `Hi!\n\n${inviter} invited you to join "${company.name}" on Taskflow.\n\nJoin here: ${link}\n\nThe link works for 7 days. If you don't have an account yet, sign up with this email first.\n\n– Taskflow`
  );
  // the email can go out in the background when the caller shouldn't wait on the mail server
  const sent = waitForEmail ? await sending : null;
  const user = existing === undefined ? await findUserByEmail(email) : existing;
  if (user)
    await notify(actorId, [{
      user_id: user.id, type: "invite", link: `/join-company?token=${raw}`,
      message: `${inviter} invited you to join ${company.name}`,
    }]);
  return { invite, sent };
};

// GET /companies/:id/invites — pending invites
export const getCompanyInvites = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  if (!can(member, "members.invite")) return res.status(403).json({ error: "Only admins and managers see invites" });
  const { data, error } = await supabase
    .from("company_invites")
    .select("id, email, role, team_id, project_id, template_id, expires_at, created_at, via_profile, teams(name), projects(name)")
    .eq("company_id", req.params.id)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map(({ teams, projects, ...i }) => ({ ...i, email: i.via_profile ? maskEmail(i.email) : i.email, team_name: teams?.name, project_name: projects?.name })));
};

// DELETE /companies/:id/invites/:inviteId
export const revokeCompanyInvite = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  if (!can(member, "members.invite")) return res.status(403).json({ error: "Only admins and managers manage invites" });
  await supabase.from("company_invites").delete().eq("id", req.params.inviteId).eq("company_id", req.params.id);
  await audit(req, req.params.id, "invite.revoked", "invite", req.params.inviteId);
  res.json({ success: true });
};

const findCompanyInvite = async (raw) => {
  if (!raw) return null;
  const { data } = await supabase
    .from("company_invites")
    .select("*, companies(name), inviter:users!invited_by(name, email), teams(name), projects(name)")
    .eq("token_hash", hashToken(String(raw)))
    .maybeSingle();
  return data;
};

// GET /companies/invites/lookup?token= — what the join page shows
export const lookupCompanyInvite = async (req, res) => {
  const invite = await findCompanyInvite(req.query.token);
  if (!invite) return res.status(404).json({ error: "This invite link is not valid" });
  const expired = new Date(invite.expires_at) < new Date();
  res.json({
    company_name: invite.companies?.name,
    invited_by: invite.inviter?.name || invite.inviter?.email,
    email: invite.email,
    role: invite.role,
    team_name: invite.teams?.name,
    project_name: invite.projects?.name,
    status: invite.accepted_at ? "accepted" : expired ? "expired" : "pending",
  });
};

// POST /companies/invites/accept { token }
export const acceptCompanyInvite = async (req, res) => {
  const invite = await findCompanyInvite(req.body.token);
  if (!invite) return res.status(404).json({ error: "This invite link is not valid" });
  if (invite.accepted_at) return res.status(400).json({ error: "This invite was already used" });
  if (new Date(invite.expires_at) < new Date()) return res.status(400).json({ error: "This invite has expired" });

  const { data: me } = await supabase.from("users").select("email").eq("id", req.user.id).single();
  if (me.email.toLowerCase() !== invite.email.toLowerCase())
    return res.status(403).json({ error: `This invite is for ${invite.email}. Log in with that email to accept it.` });

  // mark used first, so two quick clicks can't both run onboarding
  const { data: claimed } = await supabase
    .from("company_invites").update({ accepted_at: new Date().toISOString() })
    .eq("id", invite.id).is("accepted_at", null).select("id");
  if (!claimed?.length) return res.status(400).json({ error: "This invite was already used" });

  const isNew = await admit({
    companyId: invite.company_id, userId: req.user.id, role: invite.role,
    teamId: invite.team_id, projectId: invite.project_id, addedBy: invite.invited_by,
  });
  let onboardingTasks = 0;
  if (isNew || invite.template_id)
    onboardingTasks = await runOnboarding(invite.company_id, invite.template_id, req.user.id, invite.invited_by);
  await audit(req, invite.company_id, "member.joined", "invite", invite.id, { via: "invite", role: invite.role });
  res.json({ success: true, company_id: invite.company_id, company_name: invite.companies?.name, onboarding_tasks: onboardingTasks });
};

// ═════════════════════════════ Email-domain join ═══════════════════════════

const myDomain = async (userId) => {
  const { data: me } = await supabase.from("users").select("email, email_verified").eq("id", userId).single();
  if (!me || me.email_verified === false) return null; // a domain only counts once you've proved you own the address
  return me.email.split("@")[1]?.toLowerCase() || null;
};

// GET /companies/discover — companies I can join with my work email
export const discoverCompanies = async (req, res) => {
  const domain = await myDomain(req.user.id);
  if (!domain) return res.json([]);
  const { data: companies, error } = await supabase
    .from("companies").select("id, name, work_type, domain_join")
    .eq("email_domain", domain).neq("domain_join", "off");
  if (error) return res.status(500).json({ error: error.message });
  if (!companies.length) return res.json([]);

  const ids = companies.map((c) => c.id);
  const [{ data: mine }, { data: pending }] = await Promise.all([
    supabase.from("company_members").select("company_id").eq("user_id", req.user.id).eq("status", "active").in("company_id", ids),
    supabase.from("join_requests").select("company_id").eq("user_id", req.user.id).eq("status", "pending").in("company_id", ids),
  ]);
  const inIds = new Set((mine || []).map((m) => m.company_id));
  const pendingIds = new Set((pending || []).map((p) => p.company_id));
  res.json(companies.filter((c) => !inIds.has(c.id)).map((c) => ({ ...c, requested: pendingIds.has(c.id) })));
};

// POST /companies/:id/join { message? } — join (auto) or ask to join (request)
export const joinByDomain = async (req, res) => {
  const { data: company } = await supabase
    .from("companies").select("id, name, email_domain, domain_join").eq("id", req.params.id).maybeSingle();
  const domain = await myDomain(req.user.id);
  // same answer for "doesn't exist" and "not your domain", so company ids can't be probed
  if (!company || !domain || company.email_domain !== domain || company.domain_join === "off")
    return res.status(404).json({ error: "You can't join this company with your email" });
  if (await getCompanyMember(company.id, req.user.id)) return res.status(400).json({ error: "You're already in this company" });

  if (company.domain_join === "auto") {
    await admit({ companyId: company.id, userId: req.user.id, role: "member" });
    const onboardingTasks = await runOnboarding(company.id, null, req.user.id, null);
    await audit(req, company.id, "member.joined", "company", company.id, { via: "email_domain" });
    return res.json({ joined: true, company_id: company.id, onboarding_tasks: onboardingTasks });
  }

  const message = String(req.body?.message || "").trim().slice(0, 500) || null;
  const { data: request, error } = await supabase
    .from("join_requests").insert([{ company_id: company.id, user_id: req.user.id, message }]).select().single();
  if (error?.code === "23505") return res.status(400).json({ error: "You already asked to join; an admin will decide" });
  if (error) return res.status(500).json({ error: error.message });

  const { data: me } = await supabase.from("users").select("name, email").eq("id", req.user.id).single();
  await notify(req.user.id, (await approverIds(company.id)).map((uid) => ({
    user_id: uid, type: "join_request", link: "/company",
    message: `${me.name || me.email} asked to join ${company.name}`,
  })));
  res.status(201).json({ requested: true, request_id: request.id });
};

// GET /companies/:id/join-requests — pending requests (admins + managers)
export const getJoinRequests = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  if (!can(member, "members.invite")) return res.status(403).json({ error: "Only admins and managers see join requests" });
  const { data, error } = await supabase
    .from("join_requests").select("id, message, created_at, users!user_id(id, name, email)")
    .eq("company_id", req.params.id).eq("status", "pending").order("created_at");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map(({ users, ...r }) => ({ ...r, user: users })));
};

// POST /companies/:id/join-requests/:requestId { decision: "approve"|"deny", role?, team_id? }
export const decideJoinRequest = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  if (!can(member, "members.invite")) return res.status(403).json({ error: "Only admins and managers decide join requests" });
  const { decision } = req.body;
  if (!["approve", "deny"].includes(decision)) return res.status(400).json({ error: "decision must be approve or deny" });
  const role = req.body.role || "member";
  if (!["member", "viewer", "manager", "admin"].includes(role)) return res.status(400).json({ error: "Unknown role" });
  if (["admin", "manager"].includes(role) && !isCompanyAdmin(member))
    return res.status(403).json({ error: "Only admins give out admin or manager" });
  const teamId = req.body.team_id || null;
  if (teamId) {
    const { data } = UUID_RE.test(teamId)
      ? await supabase.from("teams").select("id").eq("id", teamId).eq("company_id", req.params.id).maybeSingle()
      : { data: null };
    if (!data) return res.status(400).json({ error: "Team not found" });
  }

  // decide only once, even with two admins clicking at the same time
  const { data: rows } = await supabase
    .from("join_requests")
    .update({ status: decision === "approve" ? "approved" : "denied", decided_by: req.user.id, decided_at: new Date().toISOString() })
    .eq("id", req.params.requestId).eq("company_id", req.params.id).eq("status", "pending")
    .select("user_id");
  if (!rows?.length) return res.status(404).json({ error: "Request not found or already decided" });
  const userId = rows[0].user_id;

  const { data: company } = await supabase.from("companies").select("name").eq("id", req.params.id).single();
  if (decision === "approve") {
    await admit({ companyId: req.params.id, userId, role, teamId });
    await runOnboarding(req.params.id, null, userId, req.user.id);
    await audit(req, req.params.id, "member.joined", "user", userId, { via: "join_request", role });
  } else {
    await audit(req, req.params.id, "join_request.denied", "user", userId);
  }
  await notify(req.user.id, [{
    user_id: userId, type: "join_request", link: decision === "approve" ? "/dashboard" : "/companies/new",
    message: decision === "approve" ? `You're in! Welcome to ${company.name}` : `Your request to join ${company.name} was declined`,
  }]);
  res.json({ success: true });
};

// ═════════════════════════════ Onboarding checklists ═══════════════════════

const readItems = (items) => {
  if (!Array.isArray(items)) return { error: "items must be a list" };
  const clean = items
    .map((i) => ({ title: String(i?.title || "").trim().slice(0, 200), days: Math.max(0, Math.min(365, parseInt(i?.days, 10) || 0)) }))
    .filter((i) => i.title);
  if (!clean.length) return { error: "Add at least one task" };
  if (clean.length > 40) return { error: "At most 40 tasks per checklist" };
  return { items: clean };
};

// GET /companies/:id/onboarding
export const getTemplates = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  if (!can(member, "members.invite")) return res.status(403).json({ error: "Only admins and managers see checklists" });
  const { data, error } = await supabase
    .from("onboarding_templates").select("*").eq("company_id", req.params.id).order("created_at");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
};

const saveTemplate = async (req, res, existing) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  if (!can(member, "structure.edit")) return res.status(403).json({ error: "Only admins edit onboarding checklists" });

  const row = {};
  if (!existing || req.body.name !== undefined) {
    const name = String(req.body.name || "").trim();
    if (!name || name.length > 80) return res.status(400).json({ error: "Name must be 1-80 characters" });
    row.name = name;
  }
  if (!existing || req.body.items !== undefined) {
    const { items, error } = readItems(req.body.items);
    if (error) return res.status(400).json({ error });
    row.items = items;
  }
  if (req.body.is_default !== undefined) row.is_default = !!req.body.is_default;
  if (req.body.team_id !== undefined) {
    const teamId = req.body.team_id || null;
    if (teamId) {
      const { data } = UUID_RE.test(teamId)
        ? await supabase.from("teams").select("id").eq("id", teamId).eq("company_id", req.params.id).maybeSingle()
        : { data: null };
      if (!data) return res.status(400).json({ error: "Team not found" });
    }
    row.team_id = teamId;
  }

  const query = existing
    ? supabase.from("onboarding_templates").update(row).eq("id", existing.id)
    : supabase.from("onboarding_templates").insert([{ ...row, company_id: req.params.id, created_by: req.user.id }]);
  const { data, error } = await query.select().single();
  if (error) return res.status(500).json({ error: error.message });
  await audit(req, req.params.id, existing ? "onboarding.updated" : "onboarding.created", "onboarding", data.id, { name: data.name });
  res.status(existing ? 200 : 201).json(data);
};

// POST /companies/:id/onboarding { name, items, is_default?, team_id? }
export const createTemplate = (req, res) => saveTemplate(req, res, null);

// PUT /companies/:id/onboarding/:templateId
export const updateTemplate = async (req, res) => {
  const { data: existing } = await supabase
    .from("onboarding_templates").select("id").eq("id", req.params.templateId).eq("company_id", req.params.id).maybeSingle();
  if (!existing) return res.status(404).json({ error: "Checklist not found" });
  return saveTemplate(req, res, existing);
};

// DELETE /companies/:id/onboarding/:templateId
export const deleteTemplate = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  if (!can(member, "structure.edit")) return res.status(403).json({ error: "Only admins edit onboarding checklists" });
  await supabase.from("onboarding_templates").delete().eq("id", req.params.templateId).eq("company_id", req.params.id);
  res.json({ success: true });
};

// POST /companies/:id/onboarding/:templateId/assign { user_id } — give a checklist to someone already here
export const assignTemplate = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  if (!can(member, "members.invite")) return res.status(403).json({ error: "Only admins and managers assign checklists" });
  const { data: template } = await supabase
    .from("onboarding_templates").select("id").eq("id", req.params.templateId).eq("company_id", req.params.id).maybeSingle();
  if (!template) return res.status(404).json({ error: "Checklist not found" });
  const target = await getCompanyMember(req.params.id, req.body.user_id);
  if (!target) return res.status(400).json({ error: "Pick someone in this company" });
  const count = await runOnboarding(req.params.id, template.id, target.user_id, req.user.id);
  await audit(req, req.params.id, "onboarding.assigned", "user", target.user_id, { tasks: count });
  res.json({ success: true, tasks: count });
};
