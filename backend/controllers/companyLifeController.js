// controllers/companyLifeController.js
// Things that happen to people over time: moving between teams (transfers),
// company announcements with read receipts, and handing over work when someone leaves.
import { supabase } from "../config/supabase.js";
import { notify } from "./notificationController.js";
import { can, getCompanyMember, isCompanyAdmin, teamAccess } from "../utils/permissions.js";
import { audit } from "../utils/audit.js";
import { publishToTeam } from "../utils/events.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "");
const todayUtc = () => new Date().toISOString().slice(0, 10);

const memberOr404 = async (req, res) => {
  const member = await getCompanyMember(req.params.id, req.user.id);
  if (!member) res.status(404).json({ error: "Company not found" });
  return member;
};

const teamInCompany = async (companyId, teamId) => {
  if (!teamId || !UUID_RE.test(teamId)) return null;
  const { data } = await supabase.from("teams").select("id, name, department_id").eq("id", teamId).eq("company_id", companyId).maybeSingle();
  return data;
};

const leadsOf = async (teamId) => {
  if (!teamId) return [];
  const { data } = await supabase.from("team_members").select("user_id").eq("team_id", teamId).eq("role", "lead");
  return (data || []).map((m) => m.user_id);
};

// May this member approve a move into/out of these teams?
// Admins always; managers who run either team (their department, or no department).
const canApprove = async (member, transfer) => {
  if (isCompanyAdmin(member)) return true;
  if (!can(member, "transfers.approve")) return false;
  for (const teamId of [transfer.to_team_id, transfer.from_team_id].filter(Boolean))
    if ((await teamAccess(teamId, member.user_id)).canManage) return true;
  return false;
};

// Open company tasks of one person that sit on a team (or nowhere, if teamId is null and anyTeam)
const openTasksOf = async (companyId, userId, teamId) => {
  let q = supabase.from("tasks").select("id").eq("company_id", companyId).eq("assignee_id", userId).neq("status", "Done");
  if (teamId) q = q.eq("team_id", teamId);
  const { data } = await q;
  return (data || []).map((t) => t.id);
};

// ═════════════════════════════ Transfers ═══════════════════════════════════

// Carry out an approved transfer: team membership, department, manager, open tasks.
export const applyTransfer = async (t, actorId = null) => {
  // claim it first so the hourly job and an approval can't both run it
  const { data: claimed } = await supabase
    .from("transfers").update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", t.id).eq("status", "approved").select("id");
  if (!claimed?.length) return false;

  const still = await getCompanyMember(t.company_id, t.user_id);
  if (!still) {
    await supabase.from("transfers").update({ status: "cancelled", note: `${t.note || ""} (they left the company)`.trim() }).eq("id", t.id);
    return false;
  }

  let moved = 0;
  if (t.from_team_id && t.task_plan === "reassign" && t.reassign_to && (await getCompanyMember(t.company_id, t.reassign_to))) {
    const ids = await openTasksOf(t.company_id, t.user_id, t.from_team_id);
    if (ids.length) await supabase.from("tasks").update({ assignee_id: t.reassign_to }).in("id", ids);
    moved = ids.length;
  }
  if (t.from_team_id) await supabase.from("team_members").delete().eq("team_id", t.from_team_id).eq("user_id", t.user_id);
  const { data: onTeam } = await supabase.from("team_members").select("id").eq("team_id", t.to_team_id).eq("user_id", t.user_id).maybeSingle();
  if (!onTeam) await supabase.from("team_members").insert([{ team_id: t.to_team_id, user_id: t.user_id, role: "member" }]);

  const profile = {};
  if (t.to_department_id) profile.department_id = t.to_department_id;
  if (t.to_manager_id && t.to_manager_id !== t.user_id) profile.manager_id = t.to_manager_id;
  if (Object.keys(profile).length)
    await supabase.from("company_members").update(profile).eq("company_id", t.company_id).eq("user_id", t.user_id);
  await supabase.from("transfers").update({ tasks_moved: moved }).eq("id", t.id);

  const { data: toTeam } = await supabase.from("teams").select("name").eq("id", t.to_team_id).single();
  await notify(actorId, [
    { user_id: t.user_id, type: "transfer", link: "/team", message: `You've moved to ${toTeam?.name}` },
    ...(moved ? [{ user_id: t.reassign_to, type: "assigned", link: "/inbox", message: `${moved} task(s) were handed to you after a team move` }] : []),
  ]);
  await audit({ user: actorId ? { id: actorId } : null }, t.company_id, "member.transferred", "user", t.user_id,
    { to_team: toTeam?.name, tasks_reassigned: moved });
  [t.from_team_id, t.to_team_id].filter(Boolean).forEach((id) => publishToTeam(id, "team", {}).catch(() => {}));
  return true;
};

// Hourly: carry out approved transfers whose date has come
export const runTransfersJob = async () => {
  const { data } = await supabase.from("transfers").select("*").eq("status", "approved").lte("effective_date", todayUtc());
  let done = 0;
  for (const t of data || []) if (await applyTransfer(t)) done++;
  if (done) console.log(`[Cron] transfers: completed ${done}`);
};

// POST /companies/:id/transfers
// { user_id, to_team_id, from_team_id?, effective_date?, task_plan?, reassign_to?, to_department_id?, to_manager_id?, note? }
export const requestTransfer = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  const companyId = req.params.id;
  const userId = req.body.user_id || req.user.id;
  const target = await getCompanyMember(companyId, userId);
  if (!target) return res.status(400).json({ error: "Pick someone in this company" });
  if (["guest", "viewer"].includes(target.role)) return res.status(400).json({ error: "Guests and viewers aren't on teams" });

  const toTeam = await teamInCompany(companyId, req.body.to_team_id);
  if (!toTeam) return res.status(400).json({ error: "Pick the team they're moving to" });
  let fromTeam = null;
  if (req.body.from_team_id) {
    fromTeam = await teamInCompany(companyId, req.body.from_team_id);
    const { data: onFrom } = fromTeam
      ? await supabase.from("team_members").select("id").eq("team_id", fromTeam.id).eq("user_id", userId).maybeSingle()
      : { data: null };
    if (!onFrom) return res.status(400).json({ error: "They're not on the team they're leaving" });
    if (fromTeam.id === toTeam.id) return res.status(400).json({ error: "That's the same team" });
  }

  // who may ask: the person themself, a lead of the team they're leaving, or an approver
  const leadOfFrom = fromTeam && (await teamAccess(fromTeam.id, req.user.id)).canManage;
  if (userId !== req.user.id && !leadOfFrom && !can(member, "transfers.approve"))
    return res.status(403).json({ error: "Only the person, their team lead or a manager can ask for a move" });

  const effective = req.body.effective_date || todayUtc();
  if (!isDate(effective)) return res.status(400).json({ error: "Invalid date" });
  const plan = req.body.task_plan || "keep";
  if (!["keep", "reassign"].includes(plan)) return res.status(400).json({ error: "task_plan must be keep or reassign" });
  let reassignTo = null;
  if (plan === "reassign") {
    if (!fromTeam) return res.status(400).json({ error: "Pick the team they're leaving to hand over its tasks" });
    const r = req.body.reassign_to && (await getCompanyMember(companyId, req.body.reassign_to));
    if (!r || r.user_id === userId || ["viewer", "guest"].includes(r.role))
      return res.status(400).json({ error: "Pick who takes over their open tasks" });
    reassignTo = r.user_id;
  }
  let toDept = null;
  if (req.body.to_department_id) {
    const { data } = UUID_RE.test(req.body.to_department_id)
      ? await supabase.from("departments").select("id").eq("id", req.body.to_department_id).eq("company_id", companyId).maybeSingle()
      : { data: null };
    if (!data) return res.status(400).json({ error: "Department not found" });
    toDept = data.id;
  } else if (toTeam.department_id) {
    toDept = toTeam.department_id; // moving into a team usually means its department
  }
  let toManager = null;
  if (req.body.to_manager_id) {
    if (!(await getCompanyMember(companyId, req.body.to_manager_id)) || req.body.to_manager_id === userId)
      return res.status(400).json({ error: "Pick a manager in this company" });
    toManager = req.body.to_manager_id;
  }

  const row = {
    company_id: companyId, user_id: userId, from_team_id: fromTeam?.id || null, to_team_id: toTeam.id,
    to_department_id: toDept, to_manager_id: toManager, effective_date: effective, task_plan: plan,
    reassign_to: reassignTo, note: String(req.body.note || "").trim().slice(0, 500) || null, requested_by: req.user.id,
  };
  // an approver asking is also approving
  const selfApproved = await canApprove(member, row) && (userId !== req.user.id || isCompanyAdmin(member));
  if (selfApproved) Object.assign(row, { status: "approved", decided_by: req.user.id, decided_at: new Date().toISOString() });

  const { data: transfer, error } = await supabase.from("transfers").insert([row]).select().single();
  if (error?.code === "23505") return res.status(400).json({ error: "They already have a move waiting" });
  if (error) return res.status(500).json({ error: error.message });
  await audit(req, companyId, "transfer.requested", "transfer", transfer.id, { to_team: toTeam.name, effective_date: effective });

  if (selfApproved && effective <= todayUtc()) await applyTransfer(transfer, req.user.id);
  else if (!selfApproved) {
    // tell the people who can approve: admins, and leads of both teams
    const { data: admins } = await supabase.from("company_members").select("user_id")
      .eq("company_id", companyId).eq("status", "active").in("role", ["owner", "admin"]);
    const told = new Set([...(admins || []).map((a) => a.user_id), ...(await leadsOf(toTeam.id)), ...(await leadsOf(fromTeam?.id))]);
    const { data: who } = await supabase.from("users").select("name, email").eq("id", userId).single();
    await notify(req.user.id, [...told].map((uid) => ({
      user_id: uid, type: "transfer", link: "/company",
      message: `${who.name || who.email} asked to move to ${toTeam.name}`,
    })));
  }
  const { data: fresh } = await supabase.from("transfers").select("*").eq("id", transfer.id).single();
  res.status(201).json(fresh);
};

// A move that comes from a hire on the job board. The hiring side asks; it is approved
// right away when they may approve moves for these teams, otherwise it waits like any request.
// Returns the transfer, or null when the person already has a move waiting or is on that team.
export const transferForHire = async ({ companyId, userId, toTeamId, actor, effectiveDate, note }) => {
  const toTeam = await teamInCompany(companyId, toTeamId);
  if (!toTeam) return null;
  const { data: teams } = await supabase.from("team_members").select("team_id, teams!inner(company_id)").eq("user_id", userId).eq("teams.company_id", companyId);
  const current = (teams || []).map((t) => t.team_id);
  if (current.includes(toTeam.id)) return null;
  const row = {
    company_id: companyId, user_id: userId, from_team_id: current.length === 1 ? current[0] : null, to_team_id: toTeam.id,
    to_department_id: toTeam.department_id || null, effective_date: isDate(effectiveDate) ? effectiveDate : todayUtc(),
    task_plan: "keep", note: String(note || "").slice(0, 500) || null, requested_by: actor.user_id,
  };
  const approved = await canApprove(actor, row);
  if (approved) Object.assign(row, { status: "approved", decided_by: actor.user_id, decided_at: new Date().toISOString() });
  const { data: transfer, error } = await supabase.from("transfers").insert([row]).select().single();
  if (error) return null;
  if (approved && row.effective_date <= todayUtc()) await applyTransfer(transfer, actor.user_id);
  else if (!approved) {
    const { data: admins } = await supabase.from("company_members").select("user_id")
      .eq("company_id", companyId).eq("status", "active").in("role", ["owner", "admin"]);
    const told = new Set([...(admins || []).map((a) => a.user_id), ...(await leadsOf(toTeam.id)), ...(await leadsOf(row.from_team_id))]);
    const { data: who } = await supabase.from("users").select("name, email").eq("id", userId).single();
    await notify(actor.user_id, [...told].map((uid) => ({
      user_id: uid, type: "transfer", link: "/company", message: `${who.name || who.email} was hired into ${toTeam.name} — approve the move`,
    })));
  }
  const { data: fresh } = await supabase.from("transfers").select("*").eq("id", transfer.id).single();
  return fresh;
};

// GET /companies/:id/transfers — approvers see everything, others their own
export const getTransfers = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  let q = supabase
    .from("transfers")
    .select("*, person:users!user_id(id, name, email), from_team:teams!from_team_id(name), to_team:teams!to_team_id(name), reassignee:users!reassign_to(name, email), requester:users!requested_by(name, email)")
    .eq("company_id", req.params.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (!can(member, "transfers.approve")) q = q.eq("user_id", req.user.id);
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  const out = [];
  for (const t of data) out.push({ ...t, can_decide: t.status === "pending" && (await canApprove(member, t)) && (t.user_id !== req.user.id || isCompanyAdmin(member)) });
  res.json(out);
};

// POST /companies/:id/transfers/:transferId/decide { decision: "approve"|"reject" }
export const decideTransfer = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  const { data: t } = await supabase.from("transfers").select("*").eq("id", req.params.transferId).eq("company_id", req.params.id).maybeSingle();
  if (!t) return res.status(404).json({ error: "Transfer not found" });
  if (!(await canApprove(member, t))) return res.status(403).json({ error: "You can't approve this move" });
  if (t.user_id === req.user.id && !isCompanyAdmin(member)) return res.status(403).json({ error: "Someone else has to approve your own move" });
  const { decision } = req.body;
  if (!["approve", "reject"].includes(decision)) return res.status(400).json({ error: "decision must be approve or reject" });

  const { data: rows } = await supabase
    .from("transfers")
    .update({ status: decision === "approve" ? "approved" : "rejected", decided_by: req.user.id, decided_at: new Date().toISOString() })
    .eq("id", t.id).eq("status", "pending").select("*");
  if (!rows?.length) return res.status(400).json({ error: "Already decided" });
  await audit(req, req.params.id, `transfer.${decision === "approve" ? "approved" : "rejected"}`, "transfer", t.id);
  if (decision === "approve" && t.effective_date <= todayUtc()) await applyTransfer(rows[0], req.user.id);
  else
    await notify(req.user.id, [{
      user_id: t.user_id, type: "transfer", link: "/company",
      message: decision === "approve" ? `Your team move was approved for ${t.effective_date}` : "Your team move was declined",
    }]);
  res.json({ success: true });
};

// POST /companies/:id/transfers/:transferId/cancel — the person, the requester, or an approver
export const cancelTransfer = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  const { data: t } = await supabase.from("transfers").select("*").eq("id", req.params.transferId).eq("company_id", req.params.id).maybeSingle();
  if (!t) return res.status(404).json({ error: "Transfer not found" });
  if (![t.user_id, t.requested_by].includes(req.user.id) && !(await canApprove(member, t)))
    return res.status(403).json({ error: "You can't cancel this move" });
  const { data: rows } = await supabase.from("transfers").update({ status: "cancelled" })
    .eq("id", t.id).in("status", ["pending", "approved"]).select("id");
  if (!rows?.length) return res.status(400).json({ error: "This move is already finished" });
  await audit(req, req.params.id, "transfer.cancelled", "transfer", t.id);
  res.json({ success: true });
};

// ═════════════════════════════ Announcements ═══════════════════════════════

// Which announcements reach this member: company-wide, their teams, their department
const audienceFilter = async (member) => {
  const { data: teams } = await supabase.from("team_members").select("team_id, teams!inner(company_id)")
    .eq("user_id", member.user_id).eq("teams.company_id", member.company_id);
  const parts = ["audience.eq.company"];
  const teamIds = (teams || []).map((t) => t.team_id);
  if (teamIds.length) parts.push(`team_id.in.(${teamIds.join(",")})`);
  if (member.department_id) parts.push(`department_id.eq.${member.department_id}`);
  return parts.join(",");
};

// Everyone an announcement is for (user ids)
const recipientsOf = async (a) => {
  if (a.audience === "team") {
    const { data } = await supabase.from("team_members").select("user_id").eq("team_id", a.team_id);
    return (data || []).map((m) => m.user_id);
  }
  let q = supabase.from("company_members").select("user_id").eq("company_id", a.company_id).eq("status", "active").neq("role", "guest");
  if (a.audience === "department") q = q.eq("department_id", a.department_id);
  const { data } = await q;
  return (data || []).map((m) => m.user_id);
};

// May this member post to that audience? Admins: anywhere. Managers: their department. Leads: their team.
const canPostTo = async (member, audience, teamId, departmentId) => {
  if (can(member, "announcements.post")) return true;
  if (audience === "department") return member.role === "manager" && member.department_id === departmentId;
  if (audience === "team") return (await teamAccess(teamId, member.user_id)).canManage;
  return false;
};

// GET /companies/:id/announcements?unread=1
export const getAnnouncements = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  if (member.role === "guest") return res.json([]);
  const admin = isCompanyAdmin(member);
  let q = supabase
    .from("announcements")
    .select("*, author:users!author_id(id, name, email), teams(name), departments(name)")
    .eq("company_id", req.params.id);
  if (!admin) q = q.or(await audienceFilter(member));
  const { data, error } = await q.order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(100);
  if (error) return res.status(500).json({ error: error.message });

  const ids = data.map((a) => a.id);
  const { data: reads } = ids.length
    ? await supabase.from("announcement_reads").select("announcement_id, user_id").in("announcement_id", ids)
    : { data: [] };
  let rows = data.map(({ teams, departments, ...a }) => ({
    ...a,
    team_name: teams?.name,
    department_name: departments?.name,
    read: (reads || []).some((r) => r.announcement_id === a.id && r.user_id === req.user.id),
    read_count: (reads || []).filter((r) => r.announcement_id === a.id).length,
    can_manage: admin || a.author_id === req.user.id,
  }));
  if (req.query.unread) rows = rows.filter((a) => !a.read && a.author_id !== req.user.id);
  res.json(rows);
};

// POST /companies/:id/announcements { title, body, audience, team_id?, department_id?, pinned? }
export const createAnnouncement = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  const title = String(req.body.title || "").trim().slice(0, 200);
  if (!title) return res.status(400).json({ error: "Add a title" });
  const body = String(req.body.body || "").trim().slice(0, 10000);
  const audience = req.body.audience || "company";
  if (!["company", "team", "department"].includes(audience)) return res.status(400).json({ error: "Unknown audience" });
  let teamId = null, departmentId = null;
  if (audience === "team") {
    const team = await teamInCompany(req.params.id, req.body.team_id);
    if (!team) return res.status(400).json({ error: "Pick a team" });
    teamId = team.id;
  }
  if (audience === "department") {
    const { data } = UUID_RE.test(req.body.department_id || "")
      ? await supabase.from("departments").select("id").eq("id", req.body.department_id).eq("company_id", req.params.id).maybeSingle()
      : { data: null };
    if (!data) return res.status(400).json({ error: "Pick a department" });
    departmentId = data.id;
  }
  if (!(await canPostTo(member, audience, teamId, departmentId)))
    return res.status(403).json({ error: "You can't post to that audience" });

  const { data: a, error } = await supabase
    .from("announcements")
    .insert([{
      company_id: req.params.id, author_id: req.user.id, title, body, audience, team_id: teamId, department_id: departmentId,
      pinned: !!req.body.pinned && isCompanyAdmin(member),
    }])
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  await supabase.from("announcement_reads").insert([{ announcement_id: a.id, user_id: req.user.id }]);
  await audit(req, req.params.id, "announcement.posted", "announcement", a.id, { title, audience });
  await notify(req.user.id, (await recipientsOf(a)).map((uid) => ({
    user_id: uid, type: "announcement", link: "/announcements", message: `📣 ${title}`,
  })));
  res.status(201).json(a);
};

// POST /companies/:id/announcements/:aid/read
export const markAnnouncementRead = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  const { data: a } = await supabase.from("announcements").select("*").eq("id", req.params.aid).eq("company_id", req.params.id).maybeSingle();
  if (!a || !(await recipientsOf(a)).includes(req.user.id)) return res.status(404).json({ error: "Announcement not found" });
  await supabase.from("announcement_reads").upsert([{ announcement_id: a.id, user_id: req.user.id }], { onConflict: "announcement_id,user_id" });
  res.json({ success: true });
};

// GET /companies/:id/announcements/:aid/reads — author/admin: who read it, who hasn't
export const getAnnouncementReads = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  const { data: a } = await supabase.from("announcements").select("*").eq("id", req.params.aid).eq("company_id", req.params.id).maybeSingle();
  if (!a) return res.status(404).json({ error: "Announcement not found" });
  if (!isCompanyAdmin(member) && a.author_id !== req.user.id) return res.status(403).json({ error: "Only the author or an admin sees this" });
  const audienceIds = await recipientsOf(a);
  const [{ data: reads }, { data: people }] = await Promise.all([
    supabase.from("announcement_reads").select("user_id, read_at").eq("announcement_id", a.id),
    audienceIds.length ? supabase.from("users").select("id, name, email").in("id", audienceIds) : { data: [] },
  ]);
  const readAt = Object.fromEntries((reads || []).map((r) => [r.user_id, r.read_at]));
  res.json({
    read: (people || []).filter((p) => readAt[p.id]).map((p) => ({ ...p, read_at: readAt[p.id] })),
    unread: (people || []).filter((p) => !readAt[p.id]),
  });
};

// DELETE /companies/:id/announcements/:aid — author or admin
export const deleteAnnouncement = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  const { data: a } = await supabase.from("announcements").select("author_id").eq("id", req.params.aid).eq("company_id", req.params.id).maybeSingle();
  if (!a) return res.status(404).json({ error: "Announcement not found" });
  if (!isCompanyAdmin(member) && a.author_id !== req.user.id) return res.status(403).json({ error: "Only the author or an admin can delete it" });
  await supabase.from("announcements").delete().eq("id", req.params.aid);
  res.json({ success: true });
};

// ═════════════════════════════ Offboarding ═════════════════════════════════

// GET /companies/:id/members/:userId/open-work — what someone leaving still has
export const getOpenWork = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  if (!can(member, "members.remove") && req.params.userId !== req.user.id)
    return res.status(403).json({ error: "Admins only" });
  const { data, error } = await supabase
    .from("tasks").select("id, title, due_date, team_id, project_id, teams(name)")
    .eq("company_id", req.params.id).eq("assignee_id", req.params.userId).neq("status", "Done")
    .order("due_date", { ascending: true, nullsFirst: false }).limit(500);
  if (error) return res.status(500).json({ error: error.message });
  const { count: reviewing } = await supabase.from("tasks").select("id", { count: "exact", head: true })
    .eq("company_id", req.params.id).eq("reviewer_id", req.params.userId).neq("status", "Done");
  res.json({ tasks: data.map(({ teams, ...t }) => ({ ...t, team_name: teams?.name })), reviewing: reviewing || 0 });
};

// Hand someone's open company work to another person (used when they're removed or leave)
export const handOverWork = async (companyId, fromUserId, toUserId) => {
  const { data: open } = await supabase.from("tasks").select("id")
    .eq("company_id", companyId).eq("assignee_id", fromUserId).neq("status", "Done");
  const ids = (open || []).map((t) => t.id);
  if (ids.length) await supabase.from("tasks").update({ assignee_id: toUserId }).in("id", ids);
  // reviews they owed go to the same person
  await supabase.from("tasks").update({ reviewer_id: toUserId })
    .eq("company_id", companyId).eq("reviewer_id", fromUserId).neq("status", "Done");
  // no point watching from outside
  if (ids.length) await supabase.from("task_watchers").delete().eq("user_id", fromUserId).in("task_id", ids);
  return ids.length;
};
