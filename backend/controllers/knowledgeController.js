// controllers/knowledgeController.js
// What a company knows and has said: project status updates, the decision log,
// and wiki pages. Everything lives in a company and follows its team/project rules.
import { supabase } from "../config/supabase.js";
import { notify } from "./notificationController.js";
import { canUseProject } from "./projectController.js";
import { getMembership } from "./teamController.js";
import { isCompanyAdmin, teamAccess, getCompanyMember } from "../utils/permissions.js";
import { audit } from "../utils/audit.js";
import { addDays } from "../utils/time.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEALTH = ["on_track", "at_risk", "off_track"];
const clip = (v, n) => (v === undefined ? undefined : String(v || "").trim().slice(0, n) || null);

// Can this member see something that belongs to a team (or, with no team, the whole company)?
const canSeeTeamThing = async (member, teamId, userId) => {
  if (!member || member.role === "guest") return false;
  if (!teamId) return true;
  return (await teamAccess(teamId, userId)).canView;
};
const canSee = async (member, row, userId) =>
  row.project_id ? canUseProject(userId, row.project_id) : canSeeTeamThing(member, row.team_id, userId);

// ═════════════════════════════ Project status updates ═══════════════════════

// The numbers at the time of an update
const projectStats = async (projectId) => {
  const weekAgo = addDays(new Date().toISOString().slice(0, 10), -7);
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabase.from("tasks").select("status, due_date, completed_at").eq("project_id", projectId).is("parent_task_id", null);
  const rows = data || [];
  return {
    total: rows.length,
    open: rows.filter((t) => t.status !== "Done").length,
    done_this_week: rows.filter((t) => t.status === "Done" && t.completed_at && t.completed_at.slice(0, 10) >= weekAgo).length,
    overdue: rows.filter((t) => t.status !== "Done" && t.due_date && t.due_date < today).length,
  };
};

// GET /teams/:id/projects/:projectId/updates  (+ ?draft=1 -> current numbers for a new update)
export const getProjectUpdates = async (req, res) => {
  const { id, projectId } = req.params;
  const { data: project } = await supabase.from("projects").select("id, team_id").eq("id", projectId).eq("team_id", id).maybeSingle();
  if (!project || !(await canUseProject(req.user.id, projectId))) return res.status(404).json({ error: "Project not found" });
  const { data, error } = await supabase
    .from("project_updates").select("*, author:users!author_id(id, name, email)")
    .eq("project_id", projectId).order("created_at", { ascending: false }).limit(50);
  if (error) return res.status(500).json({ error: error.message });
  const membership = await getMembership(id, req.user.id);
  res.json({ updates: data, can_post: membership?.role === "admin", current: await projectStats(projectId) });
};

// POST /teams/:id/projects/:projectId/updates { health, summary, highlights?, risks?, next_steps? } — lead/admin
export const postProjectUpdate = async (req, res) => {
  const { id, projectId } = req.params;
  const membership = await getMembership(id, req.user.id);
  if (membership?.role !== "admin") return res.status(403).json({ error: "The team lead or an admin posts project updates" });
  const { data: project } = await supabase.from("projects").select("id, name, company_id").eq("id", projectId).eq("team_id", id).maybeSingle();
  if (!project) return res.status(404).json({ error: "Project not found" });
  if (!HEALTH.includes(req.body.health)) return res.status(400).json({ error: "Health must be on track, at risk or off track" });
  const summary = clip(req.body.summary, 5000);
  if (!summary) return res.status(400).json({ error: "Write a short summary" });

  const { data, error } = await supabase.from("project_updates").insert([{
    company_id: project.company_id, project_id: projectId, author_id: req.user.id, health: req.body.health, summary,
    highlights: clip(req.body.highlights, 5000), risks: clip(req.body.risks, 5000), next_steps: clip(req.body.next_steps, 5000),
    stats: await projectStats(projectId),
  }]).select().single();
  if (error) return res.status(500).json({ error: error.message });

  // tell the team and the project's extra people
  const [{ data: team }, { data: extra }] = await Promise.all([
    supabase.from("team_members").select("user_id").eq("team_id", id),
    supabase.from("project_members").select("user_id").eq("project_id", projectId),
  ]);
  const label = { on_track: "on track", at_risk: "at risk", off_track: "off track" }[req.body.health];
  const people = [...new Set([...(team || []), ...(extra || [])].map((m) => m.user_id))];
  await notify(req.user.id, people.map((uid) => ({
    user_id: uid, type: "project_update", link: "/updates", message: `${project.name} is ${label}: ${summary.slice(0, 80)}`,
  })));
  await audit(req, project.company_id, "project.update_posted", "project", projectId, { health: req.body.health });
  res.status(201).json(data);
};

// GET /companies/:id/updates — latest update of every project I can see (portfolio view)
export const getCompanyUpdates = async (req, res) => {
  const member = await getCompanyMember(req.params.id, req.user.id);
  if (!member) return res.status(404).json({ error: "Company not found" });
  const { data: projects } = await supabase
    .from("projects").select("id, name, color, team_id, archived, teams(name)").eq("company_id", req.params.id).eq("archived", false);
  const visible = [];
  for (const p of projects || []) if (await canUseProject(req.user.id, p.id)) visible.push(p);
  if (!visible.length) return res.json([]);
  const { data: updates } = await supabase
    .from("project_updates").select("*, author:users!author_id(id, name, email)")
    .in("project_id", visible.map((p) => p.id)).order("created_at", { ascending: false }).limit(1000);
  res.json(visible.map(({ teams, ...p }) => {
    const mine = (updates || []).filter((u) => u.project_id === p.id);
    return { ...p, team_name: teams?.name, latest: mine[0] || null, previous_health: mine[1]?.health || null };
  }).sort((a, b) => {
    const rank = { off_track: 0, at_risk: 1, on_track: 2 };
    return (rank[a.latest?.health] ?? 3) - (rank[b.latest?.health] ?? 3) || a.name.localeCompare(b.name);
  }));
};

// ═════════════════════════════ Decision log ═════════════════════════════════

const DECISION_SELECT = "*, owner:users!owner_id(id, name, email), creator:users!created_by(id, name, email), teams(name), projects(name, color), meetings(id, title)";

const readDecision = async (body, companyId, partial) => {
  const f = {};
  if (!partial || body.title !== undefined) {
    const title = clip(body.title, 300);
    if (!title) return { error: "What was decided?" };
    f.title = title;
  }
  if (body.context !== undefined) f.context = clip(body.context, 10000);
  if (body.status !== undefined) {
    if (!["proposed", "decided", "reversed"].includes(body.status)) return { error: "Unknown status" };
    f.status = body.status;
  }
  if (body.decided_on !== undefined) {
    if (body.decided_on && !/^\d{4}-\d{2}-\d{2}$/.test(body.decided_on)) return { error: "Invalid date" };
    if (body.decided_on) f.decided_on = body.decided_on;
  }
  if (body.owner_id !== undefined) {
    if (body.owner_id && !(await getCompanyMember(companyId, body.owner_id))) return { error: "The owner must be in this company" };
    f.owner_id = body.owner_id || null;
  }
  for (const key of ["team_id", "project_id"]) {
    if (body[key] === undefined) continue;
    if (body[key] && !UUID_RE.test(body[key])) return { error: `Invalid ${key}` };
    f[key] = body[key] || null;
  }
  return { fields: f };
};

// GET /decisions?q=&team_id=&project_id=&status=
export const getDecisions = async (req, res) => {
  if (!req.company) return res.json([]);
  let q = supabase.from("decisions").select(DECISION_SELECT).eq("company_id", req.company.id);
  if (req.query.team_id && UUID_RE.test(req.query.team_id)) q = q.eq("team_id", req.query.team_id);
  if (req.query.project_id && UUID_RE.test(req.query.project_id)) q = q.eq("project_id", req.query.project_id);
  if (req.query.status) q = q.eq("status", req.query.status);
  if (req.query.q?.trim()) {
    const safe = req.query.q.trim().replace(/[\\"%,()]/g, "");
    q = q.or(`title.ilike."%${safe}%",context.ilike."%${safe}%"`);
  }
  const { data, error } = await q.order("decided_on", { ascending: false }).order("created_at", { ascending: false }).limit(300);
  if (error) return res.status(500).json({ error: error.message });
  const out = [];
  for (const d of data) {
    if (!(await canSee(req.company.member, d, req.user.id))) continue;
    const { teams, projects, meetings, ...rest } = d;
    out.push({
      ...rest, team: teams, project: projects, meeting: meetings,
      can_edit: req.company.member.role !== "viewer" && (d.created_by === req.user.id || d.owner_id === req.user.id || isCompanyAdmin(req.company.member)),
    });
  }
  res.json(out);
};

// Checks team/project placement for the person writing it
const checkPlacement = async (fields, req) => {
  if (fields.project_id) {
    const { data: p } = await supabase.from("projects").select("id, team_id").eq("id", fields.project_id).eq("company_id", req.company.id).maybeSingle();
    if (!p || !(await canUseProject(req.user.id, p.id))) return "Project not found";
    fields.team_id = p.team_id;
  } else if (fields.team_id) {
    const access = await teamAccess(fields.team_id, req.user.id);
    if (!access.canView || access.team.company_id !== req.company.id) return "You're not on that team";
  }
  return null;
};

// POST /decisions { title, context?, status?, decided_on?, owner_id?, team_id?, project_id? }
export const createDecision = async (req, res) => {
  if (!req.company) return res.status(400).json({ error: "Decisions live in a company — switch to one first" });
  if (["viewer", "guest"].includes(req.company.member.role)) return res.status(403).json({ error: "You can't log decisions here" });
  const { fields, error: invalid } = await readDecision(req.body, req.company.id, false);
  if (invalid) return res.status(400).json({ error: invalid });
  const problem = await checkPlacement(fields, req);
  if (problem) return res.status(400).json({ error: problem });
  const { data, error } = await supabase.from("decisions")
    .insert([{ ...fields, company_id: req.company.id, created_by: req.user.id, owner_id: fields.owner_id || req.user.id }])
    .select().single();
  if (error) return res.status(500).json({ error: error.message });
  await audit(req, req.company.id, "decision.logged", "decision", data.id, { title: data.title });
  res.status(201).json(data);
};

const loadDecision = async (req, res) => {
  if (!req.company || !UUID_RE.test(req.params.id)) {
    res.status(404).json({ error: "Decision not found" });
    return null;
  }
  const { data } = await supabase.from("decisions").select("*").eq("id", req.params.id).eq("company_id", req.company.id).maybeSingle();
  if (!data || !(await canSee(req.company.member, data, req.user.id))) {
    res.status(404).json({ error: "Decision not found" });
    return null;
  }
  const mayEdit = req.company.member.role !== "viewer" &&
    (data.created_by === req.user.id || data.owner_id === req.user.id || isCompanyAdmin(req.company.member));
  if (!mayEdit) {
    res.status(403).json({ error: "Only its author, owner or an admin can change this" });
    return null;
  }
  return data;
};

// PUT /decisions/:id
export const updateDecision = async (req, res) => {
  const existing = await loadDecision(req, res);
  if (!existing) return;
  const { fields, error: invalid } = await readDecision(req.body, req.company.id, true);
  if (invalid) return res.status(400).json({ error: invalid });
  const problem = await checkPlacement(fields, req);
  if (problem) return res.status(400).json({ error: problem });
  const { data, error } = await supabase.from("decisions")
    .update({ ...fields, updated_at: new Date().toISOString() }).eq("id", existing.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  if (fields.status && fields.status !== existing.status)
    await audit(req, req.company.id, `decision.${fields.status}`, "decision", existing.id, { title: existing.title });
  res.json(data);
};

// DELETE /decisions/:id
export const deleteDecision = async (req, res) => {
  const existing = await loadDecision(req, res);
  if (!existing) return;
  await supabase.from("decisions").delete().eq("id", existing.id);
  res.json({ success: true });
};

// Called when a (non-private) meeting finishes: its decisions go into the log
export const logMeetingDecisions = async (meeting, actorId) => {
  if (meeting.private) return 0;
  const { data: items } = await supabase.from("meeting_items").select("id, text").eq("meeting_id", meeting.id).eq("kind", "decision");
  if (!items?.length) return 0;
  const rows = items.map((i) => ({
    company_id: meeting.company_id, team_id: meeting.team_id, project_id: meeting.project_id, meeting_id: meeting.id,
    meeting_item_id: i.id, title: i.text.slice(0, 300), decided_on: meeting.starts_at.slice(0, 10), created_by: actorId, owner_id: actorId,
  }));
  // meeting_item_id is unique, so finishing twice doesn't log twice
  const { data } = await supabase.from("decisions").upsert(rows, { onConflict: "meeting_item_id", ignoreDuplicates: true }).select("id");
  return data?.length || 0;
};

// ═════════════════════════════ Wiki ═════════════════════════════════════════

const loadPage = async (req, res, needEdit = false) => {
  if (!req.company || !UUID_RE.test(req.params.id)) {
    res.status(404).json({ error: "Page not found" });
    return null;
  }
  const { data: page } = await supabase.from("wiki_pages").select("*").eq("id", req.params.id).eq("company_id", req.company.id).maybeSingle();
  if (!page || !(await canSeeTeamThing(req.company.member, page.team_id, req.user.id))) {
    res.status(404).json({ error: "Page not found" });
    return null;
  }
  if (needEdit && req.company.member.role === "viewer") {
    res.status(403).json({ error: "Viewers can't edit pages" });
    return null;
  }
  return page;
};

// GET /wiki — every page I can see (titles only, for the tree)
// ?q=words -> only matching pages, each with a short snippet (used by search and "ask the wiki")
export const getWikiPages = async (req, res) => {
  if (!req.company || req.company.member.role === "guest") return res.json([]);
  const q = String(req.query.q || "").trim().slice(0, 200);
  let query = supabase
    .from("wiki_pages").select(`id, title, team_id, parent_id, updated_at, teams(name), editor:users!updated_by(name, email)${q ? ", body" : ""}`)
    .eq("company_id", req.company.id);
  if (q) {
    // match any of the meaningful words, in the title or the text
    const words = q.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, " ").split(/\s+/).filter((w) => w.length > 2).slice(0, 8);
    if (!words.length) return res.json([]);
    query = query.or(words.flatMap((w) => [`title.ilike.%${w}%`, `body.ilike.%${w}%`]).join(","));
  }
  const { data, error } = await query.order("title").limit(q ? 50 : 1000);
  if (error) return res.status(500).json({ error: error.message });
  const teamOk = {};
  const out = [];
  for (const p of data) {
    if (p.team_id && teamOk[p.team_id] === undefined) teamOk[p.team_id] = (await teamAccess(p.team_id, req.user.id)).canView;
    if (p.team_id && !teamOk[p.team_id]) continue;
    const { teams, body, ...rest } = p;
    if (q) {
      const at = body.toLowerCase().indexOf(q.toLowerCase().split(/\s+/)[0]);
      rest.snippet = body.slice(Math.max(0, at - 80), Math.max(0, at - 80) + 300);
      rest.body_length = body.length;
    }
    out.push({ ...rest, team_name: teams?.name });
  }
  res.json(out);
};

// GET /wiki/:id — one page + its history (newest first)
export const getWikiPage = async (req, res) => {
  const page = await loadPage(req, res);
  if (!page) return;
  const { data: versions } = await supabase
    .from("wiki_page_versions").select("id, title, created_at, editor:users!edited_by(name, email)")
    .eq("page_id", page.id).order("created_at", { ascending: false }).limit(50);
  const { data: people } = await supabase.from("users").select("id, name, email").in("id", [page.created_by, page.updated_by].filter(Boolean));
  const find = (uid) => (people || []).find((u) => u.id === uid) || null;
  res.json({
    ...page, creator: find(page.created_by), editor: find(page.updated_by), versions: versions || [],
    can_edit: req.company.member.role !== "viewer",
    can_delete: page.created_by === req.user.id || isCompanyAdmin(req.company.member) || (page.team_id && (await teamAccess(page.team_id, req.user.id)).canManage),
  });
};

const checkParent = async (companyId, parentId, teamId, selfId = null) => {
  if (!parentId) return null;
  if (!UUID_RE.test(parentId)) return "Parent page not found";
  let cursor = parentId;
  for (let depth = 0; cursor && depth < 30; depth++) {
    if (cursor === selfId) return "A page can't sit inside itself";
    const { data } = await supabase.from("wiki_pages").select("id, parent_id, team_id").eq("id", cursor).eq("company_id", companyId).maybeSingle();
    if (!data) return "Parent page not found";
    if (depth === 0 && (data.team_id || null) !== (teamId || null)) return "A sub-page lives in the same space as its parent";
    cursor = data.parent_id;
  }
  return null;
};

// POST /wiki { title, body?, team_id?, parent_id? }
export const createWikiPage = async (req, res) => {
  if (!req.company) return res.status(400).json({ error: "Switch to a company first" });
  if (["viewer", "guest"].includes(req.company.member.role)) return res.status(403).json({ error: "You can't add pages here" });
  const title = clip(req.body.title, 200);
  if (!title) return res.status(400).json({ error: "Give the page a title" });
  const teamId = req.body.team_id || null;
  if (teamId) {
    const access = UUID_RE.test(teamId) ? await teamAccess(teamId, req.user.id) : { canView: false };
    if (!access.canView || access.team.company_id !== req.company.id) return res.status(400).json({ error: "You're not on that team" });
  }
  const problem = await checkParent(req.company.id, req.body.parent_id, teamId);
  if (problem) return res.status(400).json({ error: problem });
  const body = String(req.body.body || "").slice(0, 200000);
  const { data, error } = await supabase.from("wiki_pages").insert([{
    company_id: req.company.id, team_id: teamId, parent_id: req.body.parent_id || null, title, body,
    created_by: req.user.id, updated_by: req.user.id,
  }]).select().single();
  if (error) return res.status(500).json({ error: error.message });
  await supabase.from("wiki_page_versions").insert([{ page_id: data.id, title, body, edited_by: req.user.id }]);
  res.status(201).json(data);
};

// PUT /wiki/:id { title?, body?, parent_id? } — every save keeps a version
export const updateWikiPage = async (req, res) => {
  const page = await loadPage(req, res, true);
  if (!page) return;
  const u = {};
  if (req.body.title !== undefined) {
    const title = clip(req.body.title, 200);
    if (!title) return res.status(400).json({ error: "Give the page a title" });
    u.title = title;
  }
  if (req.body.body !== undefined) u.body = String(req.body.body || "").slice(0, 200000);
  if (req.body.parent_id !== undefined) {
    const problem = await checkParent(req.company.id, req.body.parent_id, page.team_id, page.id);
    if (problem) return res.status(400).json({ error: problem });
    u.parent_id = req.body.parent_id || null;
  }
  // stale-edit guard: refuse if someone saved since this editor loaded the page
  if (req.body.base_updated_at && new Date(req.body.base_updated_at).getTime() !== new Date(page.updated_at).getTime())
    return res.status(409).json({ error: "Someone else changed this page while you were editing. Copy your text, reload and try again." });

  const { data, error } = await supabase.from("wiki_pages")
    .update({ ...u, updated_by: req.user.id, updated_at: new Date().toISOString() }).eq("id", page.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  if (u.title !== undefined || u.body !== undefined)
    await supabase.from("wiki_page_versions").insert([{ page_id: page.id, title: data.title, body: data.body, edited_by: req.user.id }]);
  res.json(data);
};

// GET /wiki/:id/versions/:versionId
export const getWikiVersion = async (req, res) => {
  const page = await loadPage(req, res);
  if (!page) return;
  const { data } = await supabase.from("wiki_page_versions").select("*, editor:users!edited_by(name, email)")
    .eq("id", req.params.versionId).eq("page_id", page.id).maybeSingle();
  if (!data) return res.status(404).json({ error: "Version not found" });
  res.json(data);
};

// DELETE /wiki/:id — author, team lead or admin; sub-pages move up
export const deleteWikiPage = async (req, res) => {
  const page = await loadPage(req, res, true);
  if (!page) return;
  const allowed = page.created_by === req.user.id || isCompanyAdmin(req.company.member) ||
    (page.team_id && (await teamAccess(page.team_id, req.user.id)).canManage);
  if (!allowed) return res.status(403).json({ error: "Only its author, the team lead or an admin can delete this page" });
  await supabase.from("wiki_pages").update({ parent_id: page.parent_id }).eq("parent_id", page.id);
  await supabase.from("wiki_pages").delete().eq("id", page.id);
  await audit(req, req.company.id, "wiki.deleted", "wiki_page", page.id, { title: page.title });
  res.json({ success: true });
};
