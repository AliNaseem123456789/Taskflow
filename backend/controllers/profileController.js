// controllers/profileController.js
// Phase E step 2: opt-in public profiles, public company pages, discovery, and
// public job posts that people outside the company can apply to.
// Nothing is public until its owner turns it on. Personal tasks never appear here,
// and a person's email is never shown to anyone through these pages.
import { supabase } from "../config/supabase.js";
import { notify } from "./notificationController.js";
import { getCompanyMember, isCompanyAdmin, can } from "../utils/permissions.js";
import { audit } from "../utils/audit.js";
import { WORK_TYPES } from "../utils/workTypes.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HANDLE_RE = /^[a-z0-9][a-z0-9-]{2,29}$/;
const URL_RE = /^https?:\/\/[^\s]+$/i;
const RESERVED = new Set(["admin", "api", "app", "me", "new", "edit", "login", "signup", "settings", "help", "support", "about", "taskflow", "public", "jobs", "companies", "people"]);
export const GENRES = [
  "software", "data", "design", "product", "marketing", "sales", "support", "operations",
  "writing", "education", "research", "finance", "hr", "legal", "agency", "field work", "other",
];
const KINDS = ["full_time", "part_time", "project", "gig"];
const clip = (v, n) => String(v ?? "").trim().slice(0, n);
const cleanList = (list, max, len = 40) => [...new Set((Array.isArray(list) ? list : []).map((s) => clip(s, len).toLowerCase()).filter(Boolean))].slice(0, max);
// text safe to put inside a PostgREST or() filter
const safeQuery = (q) => clip(q, 60).replace(/[,()%*{}\\"':]/g, " ").trim();

// How big a company is, as a range (exact head counts stay private)
const sizeRange = (n) => (n <= 10 ? "1–10" : n <= 50 ? "11–50" : n <= 200 ? "51–200" : n <= 1000 ? "201–1,000" : "1,000+");

const suggestHandle = async (user) => {
  const base = (user.name || user.email.split("@")[0]).toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 24) || "user";
  const start = base.length >= 3 ? base : `${base}-me`;
  for (let i = 0; i < 20; i++) {
    const h = i ? `${start}-${i + 1}` : start;
    if (RESERVED.has(h)) continue;
    const { data } = await supabase.from("public_profiles").select("user_id").eq("handle", h).maybeSingle();
    if (!data) return h;
  }
  return `${start}-${Date.now().toString(36).slice(-4)}`;
};

// ═════════════════════════════ My profile ══════════════════════════════════

// GET /profiles/me
export const getMyProfile = async (req, res) => {
  const [{ data: profile }, { data: user }] = await Promise.all([
    supabase.from("public_profiles").select("*").eq("user_id", req.user.id).maybeSingle(),
    supabase.from("users").select("name, email").eq("id", req.user.id).single(),
  ]);
  res.json({
    profile: profile || null,
    name: user.name,
    suggested_handle: profile ? null : await suggestHandle(user),
    genres: GENRES,
  });
};

const readProfile = (body) => {
  const u = {};
  if (body.handle !== undefined) {
    const h = clip(body.handle, 30).toLowerCase();
    if (!HANDLE_RE.test(h)) return { error: "Your link name: 3–30 lowercase letters, numbers or dashes, starting with a letter or number" };
    if (RESERVED.has(h)) return { error: "That link name is reserved" };
    u.handle = h;
  }
  for (const [k, n] of [["headline", 120], ["bio", 2000], ["location", 80]]) if (body[k] !== undefined) u[k] = clip(body[k], n) || null;
  if (body.genres !== undefined) {
    const g = cleanList(body.genres, 5);
    if (g.some((x) => !GENRES.includes(x))) return { error: "Pick kinds of work from the list" };
    u.genres = g;
  }
  if (body.skills !== undefined) u.skills = cleanList(body.skills, 20);
  if (body.open_to !== undefined) {
    const o = cleanList(body.open_to, 4);
    if (o.some((x) => !KINDS.includes(x))) return { error: "Unknown kind of work" };
    u.open_to = o;
  }
  for (const k of ["is_public", "open_to_work", "show_companies"]) if (body[k] !== undefined) u[k] = !!body[k];
  if (body.links !== undefined) {
    if (!Array.isArray(body.links) || body.links.length > 6) return { error: "Up to 6 links" };
    const links = [];
    for (const l of body.links) {
      const url = clip(l?.url, 300);
      if (!url) continue;
      if (!URL_RE.test(url)) return { error: `Links must start with http:// or https:// (${url.slice(0, 40)})` };
      links.push({ label: clip(l.label, 40) || url.replace(/^https?:\/\//, "").slice(0, 40), url });
    }
    u.links = links;
  }
  if (body.showcase !== undefined) {
    if (!Array.isArray(body.showcase) || body.showcase.length > 12) return { error: "Up to 12 showcase items" };
    const items = [];
    for (const s of body.showcase) {
      const title = clip(s?.title, 100);
      if (!title) continue;
      const url = clip(s.url, 300);
      if (url && !URL_RE.test(url)) return { error: `Showcase links must start with http:// or https://` };
      items.push({ title, description: clip(s.description, 500) || null, url: url || null });
    }
    u.showcase = items;
  }
  return { u };
};

// PUT /profiles/me
export const saveMyProfile = async (req, res) => {
  const { u, error } = readProfile(req.body);
  if (error) return res.status(400).json({ error });
  const { data: existing } = await supabase.from("public_profiles").select("user_id, handle").eq("user_id", req.user.id).maybeSingle();
  if (!existing && !u.handle) {
    const { data: user } = await supabase.from("users").select("name, email").eq("id", req.user.id).single();
    u.handle = await suggestHandle(user);
  }
  const row = { ...u, updated_at: new Date().toISOString() };
  const { data, error: e2 } = existing
    ? await supabase.from("public_profiles").update(row).eq("user_id", req.user.id).select("*").single()
    : await supabase.from("public_profiles").insert([{ ...row, user_id: req.user.id }]).select("*").single();
  if (e2?.code === "23505") return res.status(400).json({ error: "That link name is taken" });
  if (e2) return res.status(500).json({ error: e2.message });
  res.json(data);
};

// ═════════════════════════════ Public pages (no login) ═════════════════════

// GET /public/people/:handle
export const getPublicProfile = async (req, res) => {
  const handle = clip(req.params.handle, 30).toLowerCase();
  const { data: p } = HANDLE_RE.test(handle)
    ? await supabase.from("public_profiles").select("*, users!user_id(name, created_at)").eq("handle", handle).maybeSingle()
    : { data: null };
  if (!p || !p.is_public) return res.status(404).json({ error: "Profile not found" });
  let companies = [];
  if (p.show_companies) {
    const { data } = await supabase.from("company_members").select("job_title, companies!inner(name, slug, is_public, work_type)")
      .eq("user_id", p.user_id).eq("status", "active").eq("companies.is_public", true);
    companies = (data || []).map((m) => ({ name: m.companies.name, slug: m.companies.slug, job_title: m.job_title }));
  }
  const { users, user_id: _uid, show_companies: _sc, ...rest } = p;
  res.json({ ...rest, id: p.user_id, name: users?.name || p.handle, member_since: users?.created_at?.slice(0, 4), companies });
};

const companyPublicView = async (c) => {
  const [{ count }, { data: jobs }] = await Promise.all([
    supabase.from("company_members").select("id", { count: "exact", head: true }).eq("company_id", c.id).eq("status", "active"),
    supabase.from("job_postings").select("id, title, kind, level, location, skills, created_at, closes_on, team:teams!team_id(name)")
      .eq("company_id", c.id).eq("visibility", "public").eq("status", "open").order("created_at", { ascending: false }),
  ]);
  const today = new Date().toISOString().slice(0, 10);
  return {
    name: c.name, slug: c.slug, tagline: c.tagline, about: c.about, website: c.website, location: c.location,
    work_type: c.work_type, work_type_label: WORK_TYPES[c.work_type]?.label || c.work_type,
    size: sizeRange(count || 0),
    jobs: (jobs || []).filter((j) => !j.closes_on || j.closes_on >= today),
  };
};

// GET /public/companies/:slug
export const getPublicCompany = async (req, res) => {
  const { data: c } = await supabase.from("companies").select("*").eq("slug", clip(req.params.slug, 80).toLowerCase()).maybeSingle();
  if (!c || !c.is_public) return res.status(404).json({ error: "Company not found" });
  res.json(await companyPublicView(c));
};

// A public, open role of a public company
const publicJob = async (jobId) => {
  if (!UUID_RE.test(jobId || "")) return null;
  const { data: j } = await supabase.from("job_postings")
    .select("id, title, description, kind, level, location, skills, openings, closes_on, created_at, status, visibility, company_id, hiring_manager_id, posted_by, team:teams!team_id(name), company:companies!company_id(name, slug, is_public, tagline)")
    .eq("id", jobId).maybeSingle();
  const today = new Date().toISOString().slice(0, 10);
  if (!j || j.visibility !== "public" || j.status !== "open" || !j.company?.is_public || (j.closes_on && j.closes_on < today)) return null;
  return j;
};

// GET /public/jobs/:jobId
export const getPublicJob = async (req, res) => {
  const j = await publicJob(req.params.jobId);
  if (!j) return res.status(404).json({ error: "This role isn't open" });
  const { company_id: _c, hiring_manager_id: _h, posted_by: _p, visibility: _v, ...rest } = j;
  res.json(rest);
};

// ═════════════════════════════ Discovery (logged in) ═══════════════════════

// GET /profiles/search?q=&genre=&skill=&location=&open_to_work=1&page=0
export const searchPeople = async (req, res) => {
  const page = Math.max(0, Math.min(50, Number(req.query.page) || 0));
  let query = supabase.from("public_profiles")
    .select("handle, headline, location, genres, skills, open_to_work, open_to, updated_at, users!user_id(name)")
    .eq("is_public", true);
  const q = safeQuery(req.query.q);
  if (q) {
    const { data: named } = await supabase.from("users").select("id").ilike("name", `%${q}%`).limit(200);
    const ids = (named || []).map((u) => u.id);
    const parts = [`headline.ilike.%${q}%`, `handle.ilike.%${q}%`, `bio.ilike.%${q}%`, `skills.cs.{${q.toLowerCase()}}`];
    if (ids.length) parts.push(`user_id.in.(${ids.join(",")})`);
    query = query.or(parts.join(","));
  }
  if (req.query.genre && GENRES.includes(req.query.genre)) query = query.contains("genres", [req.query.genre]);
  if (req.query.skill) query = query.contains("skills", [clip(req.query.skill, 40).toLowerCase()]);
  if (req.query.location) query = query.ilike("location", `%${safeQuery(req.query.location)}%`);
  if (req.query.open_to_work) query = query.eq("open_to_work", true);
  const { data, error } = await query.order("updated_at", { ascending: false }).range(page * 30, page * 30 + 29);
  if (error) return res.status(500).json({ error: error.message });
  res.json({
    people: data.map(({ users, updated_at: _u, ...p }) => ({ ...p, name: users?.name || p.handle, skills: p.skills.slice(0, 8) })),
    more: data.length === 30,
  });
};

// GET /profiles/companies?q=&genre=
export const searchCompanies = async (req, res) => {
  let query = supabase.from("companies").select("id, name, slug, tagline, location, work_type, is_public").eq("is_public", true);
  const q = safeQuery(req.query.q);
  if (q) query = query.or(`name.ilike.%${q}%,tagline.ilike.%${q}%,about.ilike.%${q}%`);
  if (req.query.genre && WORK_TYPES[req.query.genre]) query = query.eq("work_type", req.query.genre);
  const { data, error } = await query.order("name").limit(60);
  if (error) return res.status(500).json({ error: error.message });
  const ids = data.map((c) => c.id);
  const today = new Date().toISOString().slice(0, 10);
  const { data: jobs } = ids.length
    ? await supabase.from("job_postings").select("company_id, closes_on").in("company_id", ids).eq("visibility", "public").eq("status", "open")
    : { data: [] };
  res.json({
    companies: data.map(({ id, is_public: _p, ...c }) => ({
      ...c, work_type_label: WORK_TYPES[c.work_type]?.label || c.work_type,
      open_roles: (jobs || []).filter((j) => j.company_id === id && (!j.closes_on || j.closes_on >= today)).length,
    })),
    work_types: Object.entries(WORK_TYPES).map(([k, v]) => ({ key: k, label: v.label })),
  });
};

// GET /profiles/view/:handle/actions — what the viewer can do with this person (invite to which companies)
export const profileActions = async (req, res) => {
  const { data: p } = await supabase.from("public_profiles").select("user_id, is_public").eq("handle", clip(req.params.handle, 30).toLowerCase()).maybeSingle();
  if (!p?.is_public) return res.status(404).json({ error: "Profile not found" });
  const { data: mine } = await supabase.from("company_members").select("company_id, role, companies!inner(id, name)").eq("user_id", req.user.id).eq("status", "active");
  const out = [];
  for (const m of mine || []) {
    if (!can(m, "members.invite")) continue;
    if (await getCompanyMember(m.company_id, p.user_id)) continue;
    out.push({ id: m.company_id, name: m.companies.name });
  }
  res.json({ is_me: p.user_id === req.user.id, invite_to: out, user_id: p.user_id });
};

// POST /profiles/jobs/:jobId/apply { note } — apply to a public role (needs a public profile)
export const applyPublic = async (req, res) => {
  const j = await publicJob(req.params.jobId);
  if (!j) return res.status(404).json({ error: "This role isn't open" });
  if ([j.hiring_manager_id, j.posted_by].includes(req.user.id)) return res.status(400).json({ error: "You're hiring for this role" });
  const { data: prof } = await supabase.from("public_profiles").select("is_public, handle").eq("user_id", req.user.id).maybeSingle();
  if (!prof?.is_public) return res.status(400).json({ error: "Turn on your public profile first — it's what the hiring team sees" });
  const member = await getCompanyMember(j.company_id, req.user.id);
  if (member && ["viewer"].includes(member.role)) return res.status(403).json({ error: "Viewers can't apply" });
  const { data: prev } = await supabase.from("job_applications").select("*").eq("posting_id", j.id).eq("user_id", req.user.id).maybeSingle();
  if (prev && prev.status !== "withdrawn") return res.status(400).json({ error: "You've already applied" });
  const row = { note: clip(req.body.note, 3000) || null, status: "applied", external: !member, tell_manager: false, updated_at: new Date().toISOString() };
  const { data, error } = prev
    ? await supabase.from("job_applications").update(row).eq("id", prev.id).select("*").single()
    : await supabase.from("job_applications").insert([{ ...row, posting_id: j.id, user_id: req.user.id }]).select("*").single();
  if (error) return res.status(500).json({ error: error.message });
  const { data: me } = await supabase.from("users").select("name").eq("id", req.user.id).single();
  await notify(req.user.id, [...new Set([j.hiring_manager_id, j.posted_by].filter(Boolean))].map((uid) => ({
    user_id: uid, type: "job", link: `/jobs/${j.id}`, message: `${me?.name || prof.handle} applied for ${j.title}${member ? "" : " (from outside the company)"}`,
  })));
  res.status(201).json({ id: data.id, status: data.status });
};

// GET /profiles/applications — every role I applied to, in any company or from outside
export const myApplicationsEverywhere = async (req, res) => {
  const { data } = await supabase.from("job_applications")
    .select("id, status, external, created_at, updated_at, posting:job_postings!posting_id(id, title, status, company:companies!company_id(name, slug, is_public))")
    .eq("user_id", req.user.id).order("updated_at", { ascending: false }).limit(100);
  res.json(data || []);
};

// POST /profiles/applications/:appId/withdraw — for outside applicants (members use the job board)
export const withdrawPublic = async (req, res) => {
  const { data: a } = UUID_RE.test(req.params.appId || "")
    ? await supabase.from("job_applications").select("*, posting:job_postings!posting_id(id, title, hiring_manager_id)").eq("id", req.params.appId).maybeSingle()
    : { data: null };
  if (!a || a.user_id !== req.user.id) return res.status(404).json({ error: "Application not found" });
  if (!["applied", "reviewing", "interview", "offer"].includes(a.status)) return res.status(400).json({ error: `Already ${a.status}` });
  await supabase.from("job_applications").update({ status: "withdrawn", updated_at: new Date().toISOString() }).eq("id", a.id);
  res.json({ success: true });
};

// ═════════════════════════════ Company page settings ═══════════════════════

// GET /companies/:id/public-page
export const getCompanyPage = async (req, res) => {
  const member = await getCompanyMember(req.params.id, req.user.id);
  if (!member) return res.status(404).json({ error: "Company not found" });
  const { data: c } = await supabase.from("companies").select("id, name, slug, is_public, tagline, about, website, location, work_type").eq("id", req.params.id).single();
  res.json({ ...c, can_edit: isCompanyAdmin(member) });
};

// PUT /companies/:id/public-page { is_public?, tagline?, about?, website?, location? } (admins)
export const saveCompanyPage = async (req, res) => {
  const member = await getCompanyMember(req.params.id, req.user.id);
  if (!member) return res.status(404).json({ error: "Company not found" });
  if (!isCompanyAdmin(member)) return res.status(403).json({ error: "Only admins change the public page" });
  const u = {};
  for (const [k, n] of [["tagline", 140], ["about", 4000], ["location", 80]]) if (req.body[k] !== undefined) u[k] = clip(req.body[k], n) || null;
  if (req.body.website !== undefined) {
    const w = clip(req.body.website, 200);
    if (w && !URL_RE.test(w)) return res.status(400).json({ error: "Website must start with http:// or https://" });
    u.website = w || null;
  }
  if (req.body.is_public !== undefined) u.is_public = !!req.body.is_public;
  const { data, error } = await supabase.from("companies").update(u).eq("id", req.params.id)
    .select("id, name, slug, is_public, tagline, about, website, location, work_type").single();
  if (error) return res.status(500).json({ error: error.message });
  // hiding the page hides its public roles too
  if (u.is_public === false) await supabase.from("job_postings").update({ visibility: "internal" }).eq("company_id", req.params.id).eq("visibility", "public");
  if (u.is_public !== undefined) await audit(req, req.params.id, u.is_public ? "company.page_public" : "company.page_hidden", "company", req.params.id, {});
  res.json({ ...data, can_edit: true });
};
