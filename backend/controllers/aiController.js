// controllers/aiController.js
// The AI service (/chatbot) calls these with the signed-in person's own token,
// so it can only ever do and see what that person can. Here we hand out the
// daily allowance and record what was used.
import { supabase } from "../config/supabase.js";
import { isCompanyAdmin, getCompanyMember } from "../utils/permissions.js";

const FEATURES = [
  "chat", "summary", "breakdown", "quick_add", "suggest_assignee", "handover",
  "meeting_notes", "retro_themes", "project_update", "standup", "wiki_answer", "solve_problem",
];
const limitUser = () => Number(process.env.AI_DAILY_LIMIT_USER) || 60;
const limitCompany = () => Number(process.env.AI_DAILY_LIMIT_COMPANY) || 600;
const startOfDay = () => `${new Date().toISOString().slice(0, 10)}T00:00:00Z`;

const countToday = async (column, value) => {
  let q = supabase.from("ai_usage").select("id", { count: "exact", head: true }).gte("created_at", startOfDay());
  q = value === null ? q.is(column, null) : q.eq(column, value);
  const { count } = await q;
  return count || 0;
};

// GET /ai/quota — who is asking, in which workspace, and how much AI is left today
export const getQuota = async (req, res) => {
  const [{ data: me }, usedUser, usedCompany] = await Promise.all([
    supabase.from("users").select("id, name, email, timezone").eq("id", req.user.id).single(),
    countToday("user_id", req.user.id),
    req.company ? countToday("company_id", req.company.id) : Promise.resolve(0),
  ]);
  let company = null;
  if (req.company) {
    const { data } = await supabase.from("companies").select("id, name, work_type").eq("id", req.company.id).single();
    company = { ...data, role: req.company.member.role };
  }
  const left = Math.min(limitUser() - usedUser, req.company ? limitCompany() - usedCompany : Infinity);
  res.json({
    allowed: left > 0,
    remaining: Math.max(0, Number.isFinite(left) ? left : limitUser() - usedUser),
    limits: { user: limitUser(), company: req.company ? limitCompany() : null },
    used: { user: usedUser, company: req.company ? usedCompany : null },
    user: me,
    company,
  });
};

// POST /ai/usage { feature, model?, tokens_in?, tokens_out? } — one AI call happened
export const recordUsage = async (req, res) => {
  const feature = String(req.body.feature || "");
  if (!FEATURES.includes(feature)) return res.status(400).json({ error: "Unknown AI feature" });
  const n = (v) => Math.max(0, Math.min(10_000_000, parseInt(v, 10) || 0));
  const { error } = await supabase.from("ai_usage").insert([{
    company_id: req.company?.id || null, user_id: req.user.id, feature,
    model: String(req.body.model || "").slice(0, 100) || null, tokens_in: n(req.body.tokens_in), tokens_out: n(req.body.tokens_out),
  }]);
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ success: true });
};

// GET /companies/:id/ai-usage — admins: last 30 days by feature and by person
export const getCompanyAiUsage = async (req, res) => {
  const member = await getCompanyMember(req.params.id, req.user.id);
  if (!member) return res.status(404).json({ error: "Company not found" });
  if (!isCompanyAdmin(member)) return res.status(403).json({ error: "Admins only" });
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data, error } = await supabase.from("ai_usage")
    .select("feature, tokens_in, tokens_out, created_at, user_id, users!user_id(name, email)")
    .eq("company_id", req.params.id).gte("created_at", since).limit(50000);
  if (error) return res.status(500).json({ error: error.message });
  const today = new Date().toISOString().slice(0, 10);
  const byFeature = {};
  const byPerson = {};
  for (const r of data) {
    byFeature[r.feature] = (byFeature[r.feature] || 0) + 1;
    const p = (byPerson[r.user_id] ||= { id: r.user_id, name: r.users?.name, email: r.users?.email, requests: 0, tokens: 0 });
    p.requests++;
    p.tokens += r.tokens_in + r.tokens_out;
  }
  res.json({
    requests_30d: data.length,
    tokens_30d: data.reduce((s, r) => s + r.tokens_in + r.tokens_out, 0),
    requests_today: data.filter((r) => r.created_at.slice(0, 10) === today).length,
    limit_company: limitCompany(),
    limit_user: limitUser(),
    by_feature: Object.entries(byFeature).map(([feature, requests]) => ({ feature, requests })).sort((a, b) => b.requests - a.requests),
    by_person: Object.values(byPerson).sort((a, b) => b.requests - a.requests),
  });
};
