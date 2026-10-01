// controllers/analyticsController.js
// Company analytics: how much gets done, how long it takes, what's late —
// by week, team, project and person. Only company tasks the viewer may see;
// personal dones are never part of it.
import { supabase } from "../config/supabase.js";
import { getCompanyMember, taskScope, scopeAllows, teamAccess } from "../utils/permissions.js";
import { addDays } from "../utils/time.js";
import { workloadPeople } from "./timeOffController.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIELDS = "id, status, priority, created_at, started_at, completed_at, due_date, team_id, project_id, assignee_id, user_id, reviewer_id, parent_task_id";
const DAY = 86400000;

const median = (xs) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const round1 = (n) => (n === null || n === undefined ? null : Math.round(n * 10) / 10);
const dateOf = (ts) => (ts ? new Date(ts).toISOString().slice(0, 10) : null);
// Monday of the week a date falls in
const weekOf = (d) => {
  const dow = (new Date(`${d}T00:00:00Z`).getUTCDay() + 6) % 7;
  return addDays(d, -dow);
};

// Numbers for one group of tasks over the range
const summarise = (tasks, start, today) => {
  const done = tasks.filter((t) => t.status === "Done" && t.completed_at && dateOf(t.completed_at) >= start);
  const cycle = done.filter((t) => t.started_at).map((t) => Math.max(0, (new Date(t.completed_at) - new Date(t.started_at)) / DAY));
  const withDue = done.filter((t) => t.due_date);
  const open = tasks.filter((t) => t.status !== "Done");
  return {
    completed: done.length,
    created: tasks.filter((t) => dateOf(t.created_at) >= start).length,
    open: open.length,
    overdue: open.filter((t) => t.due_date && t.due_date < today).length,
    cycle_days: round1(median(cycle)),
    on_time_pct: withDue.length ? Math.round((withDue.filter((t) => dateOf(t.completed_at) <= t.due_date).length / withDue.length) * 100) : null,
  };
};

// GET /companies/:id/analytics?days=30|90|180&team_id=&project_id=
export const getAnalytics = async (req, res) => {
  const member = await getCompanyMember(req.params.id, req.user.id);
  if (!member || member.role === "guest") return res.status(404).json({ error: "Company not found" });
  const companyId = req.params.id;
  const days = [30, 90, 180, 365].includes(Number(req.query.days)) ? Number(req.query.days) : 90;
  const today = new Date().toISOString().slice(0, 10);
  const start = addDays(today, -(days - 1));
  const teamId = UUID_RE.test(req.query.team_id || "") ? req.query.team_id : null;
  const projectId = UUID_RE.test(req.query.project_id || "") ? req.query.project_id : null;

  // everything that matters for the range: still open, made in it, or finished in it
  const base = () => {
    let q = supabase.from("tasks").select(FIELDS).eq("company_id", companyId);
    if (teamId) q = q.eq("team_id", teamId);
    if (projectId) q = q.eq("project_id", projectId);
    return q;
  };
  const [openQ, createdQ, doneQ, scope] = await Promise.all([
    base().neq("status", "Done").limit(20000),
    base().gte("created_at", `${start}T00:00:00`).limit(20000),
    base().gte("completed_at", `${start}T00:00:00Z`).limit(20000),
    taskScope(member),
  ]);
  for (const q of [openQ, createdQ, doneQ]) if (q.error) return res.status(500).json({ error: q.error.message });
  const byId = new Map();
  for (const t of [...openQ.data, ...createdQ.data, ...doneQ.data]) byId.set(t.id, t);
  const tasks = [...byId.values()].filter((t) => scopeAllows(scope, t, req.user.id));

  // weekly series
  const weeks = [];
  for (let w = weekOf(start); w <= today; w = addDays(w, 7)) weeks.push(w);
  const weekly = weeks.map((w) => {
    const end = addDays(w, 6);
    const inWeek = (ts) => ts && dateOf(ts) >= w && dateOf(ts) <= end && dateOf(ts) >= start;
    const done = tasks.filter((t) => t.status === "Done" && inWeek(t.completed_at));
    return {
      week: w,
      completed: done.length,
      created: tasks.filter((t) => inWeek(t.created_at)).length,
      cycle_days: round1(median(done.filter((t) => t.started_at).map((t) => Math.max(0, (new Date(t.completed_at) - new Date(t.started_at)) / DAY)))),
    };
  });

  // names for teams / projects / people
  const [{ data: teams }, { data: projects }, people] = await Promise.all([
    supabase.from("teams").select("id, name").eq("company_id", companyId),
    supabase.from("projects").select("id, name, color, team_id, archived").eq("company_id", companyId),
    workloadPeople(member, companyId, null), // per-person rows: everyone whose workload you can see
  ]);

  if (teamId) {
    const access = await teamAccess(teamId, req.user.id);
    if (!access.canView || access.team.company_id !== companyId) return res.status(403).json({ error: "You're not on that team" });
  }

  const group = (key, list) =>
    list.map((g) => ({ ...g, ...summarise(tasks.filter((t) => t[key] === g.id), start, today) }))
      .filter((g) => g.completed || g.open || g.created);

  const visiblePeople = new Set((people || []).map((p) => p.user_id));
  const peopleRows = (people || []).map((p) => ({
    id: p.user_id, name: p.users?.name, email: p.users?.email,
    ...summarise(tasks.filter((t) => t.assignee_id === p.user_id), start, today),
  })).filter((p) => p.completed || p.open);

  res.json({
    range: { days, start, end: today },
    totals: summarise(tasks, start, today),
    open_by_priority: ["urgent", "high", "medium", "low"].map((p) => ({
      priority: p, count: tasks.filter((t) => t.status !== "Done" && (t.priority || "medium") === p).length,
    })),
    weekly,
    teams: teamId ? [] : group("team_id", (teams || []).map((t) => ({ id: t.id, name: t.name }))),
    projects: group("project_id", (projects || []).filter((p) => !p.archived).map((p) => ({ id: p.id, name: p.name, color: p.color, team_id: p.team_id }))),
    // per-person numbers only for the people whose workload you can already see
    people: peopleRows.filter((p) => visiblePeople.has(p.id)),
  });
};
