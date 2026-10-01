// controllers/jobController.js
// Internal job board: open roles inside a company, applications, and hiring.
// Applications are confidential — the applicant, the role's hiring manager, whoever
// posted it, and company admins. Nobody else (not even the applicant's own manager,
// unless the applicant chose to tell them).
import { supabase } from "../config/supabase.js";
import { notify } from "./notificationController.js";
import { transferForHire } from "./companyLifeController.js";
import { can, getCompanyMember, isCompanyAdmin, teamAccess } from "../utils/permissions.js";
import { audit } from "../utils/audit.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = ["full_time", "part_time", "project", "gig"];
const STAGES = ["applied", "reviewing", "interview", "offer", "hired", "declined"];
const OPEN_STAGES = ["applied", "reviewing", "interview", "offer"];
const STAGE_LABEL = { reviewing: "is being reviewed", interview: "moved to interview", offer: "got an offer", hired: "was accepted", declined: "was declined" };
const clip = (v, n) => String(v ?? "").trim().slice(0, n);
const cleanSkills = (list) => [...new Set((Array.isArray(list) ? list : []).map((s) => clip(s, 40).toLowerCase()).filter(Boolean))].slice(0, 20);
const POSTING_SELECT = "*, team:teams!team_id(id, name), hiring_manager:users!hiring_manager_id(id, name, email), poster:users!posted_by(id, name, email)";

const memberOr404 = async (req, res) => {
  const member = await getCompanyMember(req.params.id, req.user.id);
  if (!member) {
    res.status(404).json({ error: "Company not found" });
    return null;
  }
  if (member.role === "guest") {
    res.status(403).json({ error: "The job board is for company members" });
    return null;
  }
  return member;
};

// The hiring side of a posting: who posted it, its hiring manager, company admins
const onHiringSide = (member, posting) =>
  isCompanyAdmin(member) || posting.posted_by === member.user_id || posting.hiring_manager_id === member.user_id;

// Who may post a role: admins and managers anywhere, team leads for their own team
const mayPost = async (member, teamId) => {
  if (isCompanyAdmin(member) || can(member, "transfers.approve")) return true;
  return !!teamId && (await teamAccess(teamId, member.user_id)).canManage;
};

// How well a role fits someone: skills they share
const matchOf = (posting, skills) => {
  const mine = new Set((skills || []).map((s) => s.toLowerCase()));
  const shared = (posting.skills || []).filter((s) => mine.has(s));
  return { shared, score: posting.skills?.length ? Math.round((shared.length / posting.skills.length) * 100) : 0 };
};

const readPosting = async (body, companyId, partial) => {
  const u = {};
  if (body.title !== undefined || !partial) {
    u.title = clip(body.title, 120);
    if (!u.title) return { error: "Give the role a title" };
  }
  if (body.description !== undefined) u.description = clip(body.description, 8000) || null;
  if (body.skills !== undefined) u.skills = cleanSkills(body.skills);
  if (body.level !== undefined) u.level = clip(body.level, 60) || null;
  if (body.location !== undefined) u.location = clip(body.location, 80) || null;
  if (body.kind !== undefined) {
    if (!KINDS.includes(body.kind)) return { error: "Pick a type of role" };
    u.kind = body.kind;
  }
  if (body.openings !== undefined) {
    const n = Number(body.openings);
    if (!Number.isInteger(n) || n < 1 || n > 50) return { error: "Openings must be 1–50" };
    u.openings = n;
  }
  if (body.closes_on !== undefined) {
    if (body.closes_on && !DATE_RE.test(body.closes_on)) return { error: "Invalid closing date" };
    u.closes_on = body.closes_on || null;
  }
  if (body.status !== undefined) {
    if (!["open", "closed", "filled"].includes(body.status)) return { error: "Unknown status" };
    u.status = body.status;
  }
  if (body.team_id !== undefined) {
    if (body.team_id) {
      const { data } = UUID_RE.test(body.team_id)
        ? await supabase.from("teams").select("id").eq("id", body.team_id).eq("company_id", companyId).maybeSingle()
        : { data: null };
      if (!data) return { error: "Team not found" };
    }
    u.team_id = body.team_id || null;
  }
  if (body.hiring_manager_id !== undefined) {
    if (body.hiring_manager_id) {
      const m = await getCompanyMember(companyId, body.hiring_manager_id);
      if (!m || ["guest", "viewer"].includes(m.role)) return { error: "The hiring manager must be a member of the company" };
    }
    u.hiring_manager_id = body.hiring_manager_id || null;
  }
  return { u };
};

// close roles whose closing date has passed (checked when listing; no job needed)
const closeExpired = async (companyId) => {
  const today = new Date().toISOString().slice(0, 10);
  await supabase.from("job_postings").update({ status: "closed" }).eq("company_id", companyId).eq("status", "open").lt("closes_on", today);
};

// GET /companies/:id/jobs -> { jobs, my_skills, can_post }
export const getJobs = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  await closeExpired(req.params.id);
  const { data, error } = await supabase.from("job_postings").select(`${POSTING_SELECT}, job_applications(user_id, status)`)
    .eq("company_id", req.params.id).order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  const jobs = [];
  for (const { job_applications: apps, ...p } of data) {
    const hiring = onHiringSide(member, p);
    if (p.status !== "open" && !hiring) continue; // closed roles only matter to the hiring side
    const mine = apps.find((a) => a.user_id === req.user.id);
    jobs.push({
      ...p,
      can_manage: hiring,
      my_application: mine ? { status: mine.status } : null,
      applicants: hiring ? apps.filter((a) => a.status !== "withdrawn").length : undefined,
      new_applicants: hiring ? apps.filter((a) => a.status === "applied").length : undefined,
      match: matchOf(p, member.skills),
    });
  }
  res.json({ jobs, my_skills: member.skills || [], can_post: await mayPost(member, null) || (await leadsAny(member)), member_role: member.role });
};

// is this member a lead of any team? (leads can post for their team)
const leadsAny = async (member) => {
  const { data } = await supabase.from("team_members").select("team_id, teams!inner(company_id)").eq("user_id", member.user_id).eq("role", "lead").eq("teams.company_id", member.company_id);
  return (data || []).length > 0;
};

const loadPosting = async (req) => {
  if (!UUID_RE.test(req.params.jobId || "")) return null;
  const { data } = await supabase.from("job_postings").select(POSTING_SELECT).eq("id", req.params.jobId).eq("company_id", req.params.id).maybeSingle();
  return data;
};

// Applicant cards for the hiring side: who they are now in the company
const applicantsFor = async (postingId, companyId) => {
  const { data: apps } = await supabase.from("job_applications")
    .select("*, user:users!user_id(id, name, email)").eq("posting_id", postingId).order("created_at");
  const ids = (apps || []).map((a) => a.user_id);
  if (!ids.length) return [];
  const [{ data: members }, { data: teams }] = await Promise.all([
    supabase.from("company_members").select("user_id, job_title, level, skills, status").eq("company_id", companyId).in("user_id", ids),
    supabase.from("team_members").select("user_id, teams!inner(id, name, company_id)").in("user_id", ids).eq("teams.company_id", companyId),
  ]);
  return apps.map((a) => {
    const m = (members || []).find((x) => x.user_id === a.user_id);
    return {
      ...a,
      job_title: m?.job_title || null, level: m?.level || null, skills: m?.skills || [],
      former_member: !m || m.status !== "active",
      teams: (teams || []).filter((t) => t.user_id === a.user_id).map((t) => t.teams.name),
    };
  });
};

// GET /companies/:id/jobs/:jobId
export const getJob = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  const p = await loadPosting(req);
  if (!p) return res.status(404).json({ error: "Role not found" });
  const hiring = onHiringSide(member, p);
  if (p.status !== "open" && !hiring) {
    // applicants can still see a role they applied to
    const { data: mine } = await supabase.from("job_applications").select("id").eq("posting_id", p.id).eq("user_id", req.user.id).maybeSingle();
    if (!mine) return res.status(404).json({ error: "Role not found" });
  }
  const { data: mine } = await supabase.from("job_applications").select("id, status, note, tell_manager, created_at, updated_at")
    .eq("posting_id", p.id).eq("user_id", req.user.id).maybeSingle();
  res.json({
    ...p,
    can_manage: hiring,
    can_apply: p.status === "open" && !["viewer", "guest"].includes(member.role) && p.hiring_manager_id !== req.user.id && p.posted_by !== req.user.id,
    my_application: mine || null,
    match: matchOf(p, member.skills),
    applications: hiring ? await applicantsFor(p.id, req.params.id) : undefined,
  });
};

// POST /companies/:id/jobs
export const createJob = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  const { u, error } = await readPosting(req.body, req.params.id, false);
  if (error) return res.status(400).json({ error });
  if (!(await mayPost(member, u.team_id)))
    return res.status(403).json({ error: "Admins, managers and team leads (for their own team) post roles" });
  const { data, error: e2 } = await supabase.from("job_postings").insert([{
    kind: "full_time", ...u, company_id: req.params.id, posted_by: req.user.id,
    hiring_manager_id: u.hiring_manager_id || req.user.id, status: "open",
  }]).select(POSTING_SELECT).single();
  if (e2) return res.status(500).json({ error: e2.message });
  await audit(req, req.params.id, "job.posted", "job_posting", data.id, { title: data.title });

  // tell people whose skills match well (at least half the role's skills)
  if (data.skills.length) {
    const { data: people } = await supabase.from("company_members").select("user_id, skills, role")
      .eq("company_id", req.params.id).eq("status", "active").overlaps("skills", data.skills);
    const fits = (people || []).filter((m) => !["guest", "viewer"].includes(m.role) && matchOf(data, m.skills).score >= 50 && m.user_id !== data.hiring_manager_id);
    await notify(req.user.id, fits.slice(0, 200).map((m) => ({
      user_id: m.user_id, type: "job", link: `/jobs/${data.id}`, message: `A role that fits your skills: ${data.title}`,
    })));
  }
  res.status(201).json(data);
};

// PUT /companies/:id/jobs/:jobId
export const updateJob = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  const p = await loadPosting(req);
  if (!p) return res.status(404).json({ error: "Role not found" });
  if (!onHiringSide(member, p)) return res.status(403).json({ error: "Only the hiring side edits this role" });
  const { u, error } = await readPosting(req.body, req.params.id, true);
  if (error) return res.status(400).json({ error });
  if (u.team_id && u.team_id !== p.team_id && !(await mayPost(member, u.team_id)))
    return res.status(403).json({ error: "You can't post roles for that team" });
  const { data, error: e2 } = await supabase.from("job_postings").update({ ...u, updated_at: new Date().toISOString() })
    .eq("id", p.id).select(POSTING_SELECT).single();
  if (e2) return res.status(500).json({ error: e2.message });
  // closing a role tells the people still waiting
  if (u.status && u.status !== "open" && p.status === "open") await closeOutApplicants(p, req.user.id, u.status === "filled" ? "filled" : "closed");
  res.json(data);
};

// DELETE /companies/:id/jobs/:jobId
export const deleteJob = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  const p = await loadPosting(req);
  if (!p) return res.status(404).json({ error: "Role not found" });
  if (!onHiringSide(member, p)) return res.status(403).json({ error: "Only the hiring side removes this role" });
  await closeOutApplicants(p, req.user.id, "closed");
  await supabase.from("job_postings").delete().eq("id", p.id);
  await audit(req, req.params.id, "job.removed", "job_posting", p.id, { title: p.title });
  res.json({ success: true });
};

// Everyone still in the running hears the role is gone
const closeOutApplicants = async (p, actorId, why) => {
  const { data: open } = await supabase.from("job_applications").select("id, user_id").eq("posting_id", p.id).in("status", OPEN_STAGES);
  if (!open?.length) return;
  await supabase.from("job_applications").update({ status: "declined", updated_at: new Date().toISOString() }).in("id", open.map((a) => a.id));
  await notify(actorId, open.map((a) => ({
    user_id: a.user_id, type: "job", link: `/jobs/${p.id}`,
    message: why === "filled" ? `"${p.title}" has been filled — thanks for applying` : `"${p.title}" is no longer open`,
  })));
};

// POST /companies/:id/jobs/:jobId/apply { note?, tell_manager? }
export const applyToJob = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  if (member.role === "viewer") return res.status(403).json({ error: "Viewers can't apply" });
  const p = await loadPosting(req);
  if (!p || p.status !== "open") return res.status(404).json({ error: "This role isn't open" });
  if ([p.hiring_manager_id, p.posted_by].includes(req.user.id)) return res.status(400).json({ error: "You're hiring for this role" });
  const note = clip(req.body.note, 3000) || null;
  const tellManager = !!req.body.tell_manager;
  const { data: prev } = await supabase.from("job_applications").select("*").eq("posting_id", p.id).eq("user_id", req.user.id).maybeSingle();
  if (prev && prev.status !== "withdrawn") return res.status(400).json({ error: "You've already applied" });
  const row = { note, tell_manager: tellManager, status: "applied", updated_at: new Date().toISOString() };
  const { data, error } = prev
    ? await supabase.from("job_applications").update(row).eq("id", prev.id).select("*").single()
    : await supabase.from("job_applications").insert([{ ...row, posting_id: p.id, user_id: req.user.id }]).select("*").single();
  if (error) return res.status(500).json({ error: error.message });

  const { data: me } = await supabase.from("users").select("name, email").eq("id", req.user.id).single();
  const who = me?.name || me?.email;
  const told = [...new Set([p.hiring_manager_id, p.posted_by].filter(Boolean))].map((uid) => ({
    user_id: uid, type: "job", link: `/jobs/${p.id}`, message: `${who} applied for ${p.title}`,
  }));
  if (tellManager && member.manager_id && !told.some((t) => t.user_id === member.manager_id))
    told.push({ user_id: member.manager_id, type: "job", link: "/jobs", message: `${who} let you know they applied for ${p.title}` });
  await notify(req.user.id, told);
  res.status(201).json(data);
};

// POST /companies/:id/jobs/:jobId/withdraw
export const withdrawApplication = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  const { data: a } = UUID_RE.test(req.params.jobId || "")
    ? await supabase.from("job_applications").select("*, posting:job_postings!posting_id(id, title, company_id, hiring_manager_id)")
      .eq("posting_id", req.params.jobId).eq("user_id", req.user.id).maybeSingle()
    : { data: null };
  if (!a || a.posting.company_id !== req.params.id) return res.status(404).json({ error: "Application not found" });
  if (!OPEN_STAGES.includes(a.status)) return res.status(400).json({ error: `Your application is already ${a.status}` });
  await supabase.from("job_applications").update({ status: "withdrawn", updated_at: new Date().toISOString() }).eq("id", a.id);
  const { data: me } = await supabase.from("users").select("name, email").eq("id", req.user.id).single();
  await notify(req.user.id, [{ user_id: a.posting.hiring_manager_id, type: "job", link: `/jobs/${a.posting.id}`, message: `${me?.name || me?.email} withdrew from ${a.posting.title}` }]);
  res.json({ success: true });
};

// PUT /companies/:id/applications/:appId { status?, hiring_note?, effective_date? }
export const updateApplication = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  const { data: a } = UUID_RE.test(req.params.appId || "")
    ? await supabase.from("job_applications").select("*, posting:job_postings!posting_id(*)").eq("id", req.params.appId).maybeSingle()
    : { data: null };
  if (!a || a.posting.company_id !== req.params.id) return res.status(404).json({ error: "Application not found" });
  if (!onHiringSide(member, a.posting)) return res.status(404).json({ error: "Application not found" });
  if (a.user_id === req.user.id) return res.status(403).json({ error: "You can't move your own application" });
  const u = { updated_at: new Date().toISOString() };
  if (req.body.hiring_note !== undefined) u.hiring_note = clip(req.body.hiring_note, 3000) || null;
  const status = req.body.status;
  if (status !== undefined) {
    if (!STAGES.includes(status)) return res.status(400).json({ error: "Unknown stage" });
    if (a.status === "withdrawn") return res.status(400).json({ error: "They withdrew" });
    if (a.status === "hired") return res.status(400).json({ error: "Already hired" });
    u.status = status;
  }
  let transfer = null;
  if (status === "hired") {
    const applicant = await getCompanyMember(req.params.id, a.user_id);
    if (!applicant) return res.status(400).json({ error: "They're no longer in the company" });
    if (a.posting.team_id && !["guest", "viewer"].includes(applicant.role)) {
      transfer = await transferForHire({
        companyId: req.params.id, userId: a.user_id, toTeamId: a.posting.team_id, actor: member,
        effectiveDate: req.body.effective_date, note: `Hired for "${a.posting.title}"`,
      });
      if (transfer) u.transfer_id = transfer.id;
    }
  }
  const { data, error } = await supabase.from("job_applications").update(u).eq("id", a.id).select("*").single();
  if (error) return res.status(500).json({ error: error.message });

  if (status && status !== a.status && STAGE_LABEL[status])
    await notify(req.user.id, [{ user_id: a.user_id, type: "job", link: `/jobs/${a.posting.id}`, message: `Your application for ${a.posting.title} ${STAGE_LABEL[status]}` }]);
  if (status === "hired") {
    await audit(req, req.params.id, "job.hired", "job_posting", a.posting.id, { user_id: a.user_id });
    const { count } = await supabase.from("job_applications").select("id", { count: "exact", head: true }).eq("posting_id", a.posting.id).eq("status", "hired");
    if ((count || 0) >= a.posting.openings) {
      await supabase.from("job_postings").update({ status: "filled", updated_at: new Date().toISOString() }).eq("id", a.posting.id);
      await closeOutApplicants(a.posting, req.user.id, "filled");
    }
  }
  res.json({ ...data, transfer });
};

// GET /companies/:id/my-applications
export const getMyApplications = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  const { data } = await supabase.from("job_applications")
    .select("id, status, created_at, updated_at, posting:job_postings!posting_id!inner(id, title, status, company_id, team:teams!team_id(name))")
    .eq("user_id", req.user.id).eq("posting.company_id", req.params.id).order("updated_at", { ascending: false });
  res.json(data || []);
};
