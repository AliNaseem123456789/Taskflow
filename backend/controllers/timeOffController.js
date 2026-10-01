// controllers/timeOffController.js
// Time off (asked for, approved by your manager), company holidays,
// and the workload view: who has how much open work, and who's away.
import { supabase } from "../config/supabase.js";
import { notify } from "./notificationController.js";
import { can, getCompanyMember, isCompanyAdmin, teamAccess } from "../utils/permissions.js";
import { audit } from "../utils/audit.js";
import { addDays } from "../utils/time.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v || "");
const KINDS = ["vacation", "sick", "personal", "other"];
const todayUtc = () => new Date().toISOString().slice(0, 10);

const memberOr404 = async (req, res) => {
  const member = await getCompanyMember(req.params.id, req.user.id);
  if (!member || member.role === "guest") {
    res.status(404).json({ error: "Company not found" });
    return null;
  }
  return member;
};

// Who may approve someone's time off: admins, their own manager, or a manager of their department
const canApprove = (approver, target) =>
  isCompanyAdmin(approver) ||
  (target.manager_id && target.manager_id === approver.user_id) ||
  (approver.role === "manager" && (!approver.department_id || approver.department_id === target.department_id));

// Working days between two dates (Mon–Fri, minus company holidays)
const workingDays = (start, end, holidays) => {
  let n = 0;
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const wd = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (wd !== 0 && wd !== 6 && !holidays.has(d)) n++;
  }
  return n;
};

const holidaySet = async (companyId) => {
  const { data } = await supabase.from("company_holidays").select("date").eq("company_id", companyId);
  return new Set((data || []).map((h) => h.date));
};

// ═════════════════════════════ Time off ═════════════════════════════════════

// GET /companies/:id/time-off?from=&to=
// Everyone sees who's away (dates only). The person and their approvers also see the kind, note and pending requests.
export const getTimeOff = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  const from = isDate(req.query.from) ? req.query.from : addDays(todayUtc(), -30);
  const to = isDate(req.query.to) ? req.query.to : addDays(todayUtc(), 90);
  const [{ data, error }, { data: people }, holidays] = await Promise.all([
    supabase.from("time_off").select("*, person:users!user_id(id, name, email)")
      .eq("company_id", req.params.id).in("status", ["pending", "approved", "rejected"])
      .lte("start_date", to).gte("end_date", from).order("start_date"),
    supabase.from("company_members").select("user_id, manager_id, department_id").eq("company_id", req.params.id).eq("status", "active"),
    holidaySet(req.params.id),
  ]);
  if (error) return res.status(500).json({ error: error.message });
  const byUser = Object.fromEntries((people || []).map((p) => [p.user_id, p]));
  const rows = [];
  for (const t of data) {
    const mine = t.user_id === req.user.id;
    const approver = byUser[t.user_id] && canApprove(member, byUser[t.user_id]);
    if (t.status !== "approved" && !mine && !approver) continue; // pending/declined requests are private
    rows.push({
      id: t.id, user_id: t.user_id, person: t.person, start_date: t.start_date, end_date: t.end_date, half_day: t.half_day,
      status: t.status, days: t.half_day ? 0.5 : workingDays(t.start_date, t.end_date, holidays),
      ...(mine || approver ? { kind: t.kind, note: t.note } : { kind: "away" }),
      can_decide: t.status === "pending" && !mine && !!approver,
      can_cancel: (mine || approver) && ["pending", "approved"].includes(t.status) && t.end_date >= todayUtc(),
    });
  }
  res.json(rows);
};

// POST /companies/:id/time-off { start_date, end_date, kind, half_day?, note?, user_id? }
// Sick days and admins' own requests are approved straight away; the rest wait for a manager.
export const requestTimeOff = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  const userId = req.body.user_id || req.user.id;
  const target = userId === req.user.id ? member : await getCompanyMember(req.params.id, userId);
  if (!target || target.role === "guest") return res.status(400).json({ error: "Pick someone in this company" });
  if (userId !== req.user.id && !canApprove(member, target))
    return res.status(403).json({ error: "You can only add time off for yourself or people you manage" });

  const { start_date: start, end_date: end = req.body.start_date } = req.body;
  if (!isDate(start) || !isDate(end) || end < start) return res.status(400).json({ error: "Pick a start and end date" });
  if (end > addDays(todayUtc(), 730)) return res.status(400).json({ error: "That's more than two years away" });
  const kind = req.body.kind || "vacation";
  if (!KINDS.includes(kind)) return res.status(400).json({ error: "Unknown kind of time off" });
  const halfDay = !!req.body.half_day;
  if (halfDay && start !== end) return res.status(400).json({ error: "A half day is a single day" });

  const { data: clash } = await supabase.from("time_off").select("id")
    .eq("user_id", userId).eq("company_id", req.params.id).in("status", ["pending", "approved"])
    .lte("start_date", end).gte("end_date", start).limit(1);
  if (clash?.length) return res.status(400).json({ error: "That overlaps time off that's already booked or waiting" });

  const autoApprove = kind === "sick" || userId !== req.user.id || isCompanyAdmin(member);
  const { data: row, error } = await supabase.from("time_off").insert([{
    company_id: req.params.id, user_id: userId, kind, start_date: start, end_date: end, half_day: halfDay,
    note: String(req.body.note || "").trim().slice(0, 500) || null, created_by: req.user.id,
    ...(autoApprove ? { status: "approved", decided_by: req.user.id, decided_at: new Date().toISOString() } : {}),
  }]).select().single();
  if (error) return res.status(500).json({ error: error.message });

  if (!autoApprove) {
    // ask their manager, or the admins if they have none
    let approvers = target.manager_id ? [target.manager_id] : [];
    if (!approvers.length) {
      const { data: admins } = await supabase.from("company_members").select("user_id")
        .eq("company_id", req.params.id).eq("status", "active").in("role", ["owner", "admin"]);
      approvers = (admins || []).map((a) => a.user_id);
    }
    const { data: me } = await supabase.from("users").select("name, email").eq("id", userId).single();
    await notify(req.user.id, approvers.map((uid) => ({
      user_id: uid, type: "time_off", link: "/time-off",
      message: `${me.name || me.email} asked for time off ${start}${end !== start ? ` to ${end}` : ""}`,
    })));
  } else if (userId !== req.user.id) {
    await notify(req.user.id, [{ user_id: userId, type: "time_off", link: "/time-off", message: `Time off added for you: ${start}${end !== start ? ` to ${end}` : ""}` }]);
  }
  res.status(201).json(row);
};

const loadRequest = async (req, res) => {
  if (!UUID_RE.test(req.params.timeOffId)) {
    res.status(404).json({ error: "Request not found" });
    return null;
  }
  const { data } = await supabase.from("time_off").select("*").eq("id", req.params.timeOffId).eq("company_id", req.params.id).maybeSingle();
  if (!data) res.status(404).json({ error: "Request not found" });
  return data;
};

// POST /companies/:id/time-off/:timeOffId/decide { decision: approve|reject }
export const decideTimeOff = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  const t = await loadRequest(req, res);
  if (!t) return;
  const target = await getCompanyMember(req.params.id, t.user_id);
  if (!target || t.user_id === req.user.id || !canApprove(member, target))
    return res.status(403).json({ error: "You can't approve this request" });
  if (!["approve", "reject"].includes(req.body.decision)) return res.status(400).json({ error: "decision must be approve or reject" });
  const { data } = await supabase.from("time_off")
    .update({ status: req.body.decision === "approve" ? "approved" : "rejected", decided_by: req.user.id, decided_at: new Date().toISOString() })
    .eq("id", t.id).eq("status", "pending").select("id");
  if (!data?.length) return res.status(400).json({ error: "Already decided" });
  await notify(req.user.id, [{
    user_id: t.user_id, type: "time_off", link: "/time-off",
    message: `Your time off (${t.start_date}${t.end_date !== t.start_date ? ` to ${t.end_date}` : ""}) was ${req.body.decision === "approve" ? "approved" : "declined"}`,
  }]);
  await audit(req, req.params.id, `time_off.${req.body.decision === "approve" ? "approved" : "rejected"}`, "user", t.user_id);
  res.json({ success: true });
};

// POST /companies/:id/time-off/:timeOffId/cancel — the person or an approver
export const cancelTimeOff = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  const t = await loadRequest(req, res);
  if (!t) return;
  const target = await getCompanyMember(req.params.id, t.user_id);
  if (t.user_id !== req.user.id && !(target && canApprove(member, target)))
    return res.status(403).json({ error: "You can't cancel this" });
  const { data } = await supabase.from("time_off").update({ status: "cancelled" })
    .eq("id", t.id).in("status", ["pending", "approved"]).select("id");
  if (!data?.length) return res.status(400).json({ error: "Nothing to cancel" });
  res.json({ success: true });
};

// ── Holidays ─────────────────────────────────────────────────────────────────

// GET /companies/:id/holidays
export const getHolidays = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  const { data } = await supabase.from("company_holidays").select("id, date, name").eq("company_id", req.params.id).order("date");
  res.json(data || []);
};

// POST /companies/:id/holidays { date, name } — admins
export const addHoliday = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  if (!can(member, "company.settings")) return res.status(403).json({ error: "Admins only" });
  const name = String(req.body.name || "").trim().slice(0, 100);
  if (!isDate(req.body.date) || !name) return res.status(400).json({ error: "A holiday needs a date and a name" });
  const { data, error } = await supabase.from("company_holidays").insert([{ company_id: req.params.id, date: req.body.date, name }]).select().single();
  if (error?.code === "23505") return res.status(400).json({ error: "There's already a holiday that day" });
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
};

// DELETE /companies/:id/holidays/:holidayId — admins
export const deleteHoliday = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  if (!can(member, "company.settings")) return res.status(403).json({ error: "Admins only" });
  await supabase.from("company_holidays").delete().eq("id", req.params.holidayId).eq("company_id", req.params.id);
  res.json({ success: true });
};

// ═════════════════════════════ Workload ═════════════════════════════════════

// People whose workload this member may see:
// admins/viewers everyone; managers their department + reports; others their own teams.
const workloadPeople = async (member, companyId, teamId) => {
  const { data: all } = await supabase
    .from("company_members").select("user_id, role, manager_id, department_id, job_title, users!user_id(id, name, email)")
    .eq("company_id", companyId).eq("status", "active").neq("role", "guest");
  let people = all || [];
  if (teamId) {
    const access = await teamAccess(teamId, member.user_id);
    if (!access.canView || access.team.company_id !== companyId) return null;
    const { data: tm } = await supabase.from("team_members").select("user_id").eq("team_id", teamId);
    const ids = new Set((tm || []).map((m) => m.user_id));
    return people.filter((p) => ids.has(p.user_id));
  }
  if (["owner", "admin", "viewer"].includes(member.role)) return people;
  const { data: myTeams } = await supabase.from("team_members").select("team_id, teams!inner(company_id)")
    .eq("user_id", member.user_id).eq("teams.company_id", companyId);
  let teamIds = (myTeams || []).map((t) => t.team_id);
  if (member.role === "manager") {
    let q = supabase.from("teams").select("id").eq("company_id", companyId);
    if (member.department_id) q = q.eq("department_id", member.department_id);
    const { data: dept } = await q;
    teamIds = [...new Set([...teamIds, ...(dept || []).map((t) => t.id)])];
  }
  const { data: tm } = teamIds.length ? await supabase.from("team_members").select("user_id").in("team_id", teamIds) : { data: [] };
  const ids = new Set([member.user_id, ...(tm || []).map((m) => m.user_id)]);
  people.filter((p) => p.manager_id === member.user_id).forEach((p) => ids.add(p.user_id));
  if (member.role === "manager" && !member.department_id) return people;
  return people.filter((p) => ids.has(p.user_id));
};

// GET /companies/:id/workload?team_id=
// Per person: open company tasks, due this week, overdue, reviews waiting, finished last 7 days,
// and working days away this week / next week. Personal tasks are never counted.
export const getWorkload = async (req, res) => {
  const member = await memberOr404(req, res);
  if (!member) return;
  const teamId = req.query.team_id && UUID_RE.test(req.query.team_id) ? req.query.team_id : null;
  const people = await workloadPeople(member, req.params.id, teamId);
  if (!people) return res.status(403).json({ error: "You're not on that team" });
  if (!people.length) return res.json({ people: [], week_start: null });

  const today = todayUtc();
  const dow = (new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday = 0
  const weekStart = addDays(today, -dow);
  const weekEnd = addDays(weekStart, 4);
  const nextStart = addDays(weekStart, 7);
  const nextEnd = addDays(weekStart, 11);
  const ids = people.map((p) => p.user_id);

  const [{ data: open }, { data: reviews }, { data: done }, { data: away }, holidays] = await Promise.all([
    supabase.from("tasks").select("assignee_id, due_date, priority").eq("company_id", req.params.id).in("assignee_id", ids).neq("status", "Done"),
    supabase.from("tasks").select("reviewer_id").eq("company_id", req.params.id).in("reviewer_id", ids).neq("status", "Done"),
    supabase.from("tasks").select("assignee_id").eq("company_id", req.params.id).in("assignee_id", ids).eq("status", "Done")
      .gte("completed_at", new Date(Date.now() - 7 * 86400000).toISOString()),
    supabase.from("time_off").select("user_id, start_date, end_date, half_day").eq("company_id", req.params.id)
      .eq("status", "approved").in("user_id", ids).lte("start_date", nextEnd).gte("end_date", weekStart),
    holidaySet(req.params.id),
  ]);

  const daysAway = (uid, from, to) =>
    (away || []).filter((t) => t.user_id === uid).reduce((sum, t) => {
      const s = t.start_date > from ? t.start_date : from;
      const e = t.end_date < to ? t.end_date : to;
      if (s > e) return sum;
      return sum + (t.half_day ? 0.5 : workingDays(s, e, holidays));
    }, 0);

  const rows = people.map((p) => {
    const mine = (open || []).filter((t) => t.assignee_id === p.user_id);
    const awayNow = (away || []).find((t) => t.user_id === p.user_id && t.start_date <= today && t.end_date >= today);
    return {
      id: p.user_id, name: p.users?.name, email: p.users?.email, role: p.role, job_title: p.job_title,
      open: mine.length,
      due_this_week: mine.filter((t) => t.due_date && t.due_date >= today && t.due_date <= addDays(today, 6)).length,
      overdue: mine.filter((t) => t.due_date && t.due_date < today).length,
      urgent: mine.filter((t) => ["high", "urgent"].includes(t.priority)).length,
      reviews: (reviews || []).filter((t) => t.reviewer_id === p.user_id).length,
      done_last_7: (done || []).filter((t) => t.assignee_id === p.user_id).length,
      away_this_week: daysAway(p.user_id, weekStart, weekEnd),
      away_next_week: daysAway(p.user_id, nextStart, nextEnd),
      away_until: awayNow ? awayNow.end_date : null,
    };
  });

  // light / normal / heavy, relative to this group (with sensible floors)
  const sorted = rows.map((r) => r.open).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] || 0;
  for (const r of rows) {
    const capacity = Math.max(0, 5 - r.away_this_week) / 5; // fewer working days, less room
    const effective = capacity ? r.open / capacity : r.open ? Infinity : 0;
    r.load = r.overdue >= 3 || effective > Math.max(6, median * 1.5) ? "heavy" : effective <= Math.max(1, median * 0.5) ? "light" : "normal";
  }
  rows.sort((a, b) => b.open - a.open || (a.name || a.email).localeCompare(b.name || b.email));
  res.json({ people: rows, week_start: weekStart, median_open: median });
};

// Who is away today (used to warn when assigning work): { user_id: end_date }
export const awayToday = async (companyId) => {
  const today = todayUtc();
  const { data } = await supabase.from("time_off").select("user_id, end_date")
    .eq("company_id", companyId).eq("status", "approved").lte("start_date", today).gte("end_date", today);
  return Object.fromEntries((data || []).map((t) => [t.user_id, t.end_date]));
};
