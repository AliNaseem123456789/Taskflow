// controllers/meetingController.js
// Company meetings: schedule, agenda, notes, decisions, action items (which can
// become tasks), repeating series, 1:1s and retros. Meetings live in a company;
// Personal has none.
import { supabase } from "../config/supabase.js";
import { notify } from "./notificationController.js";
import { sendEmail, appLink } from "./emailController.js";
import { getCompanyMember, isCompanyAdmin, teamAccess } from "../utils/permissions.js";
import { audit } from "../utils/audit.js";
import { sendTo } from "../utils/events.js";
import { todayIn } from "../utils/time.js";
import { logMeetingDecisions } from "./knowledgeController.js";

const KINDS = ["meeting", "one_on_one", "retro", "standup", "review"];
const ITEM_KINDS = ["topic", "decision", "action", "went_well", "to_improve", "idea"];
const RECURRENCES = ["weekly", "biweekly", "monthly"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Starting agendas, so a 1:1 or retro isn't a blank page
const TEMPLATES = {
  meeting: "Goal of this meeting:\n\n1. \n2. \n3. ",
  one_on_one: "How are things going?\nWins since last time\nWhat's blocking you?\nFeedback (both ways)\nGrowth and goals",
  retro: "What went well, what to improve, and ideas — add cards below, then vote.",
  standup: "Yesterday\nToday\nBlockers",
  review: "What we shipped\nDemo\nWhat's next",
};

const MEETING_SELECT =
  "*, teams(id, name), projects(id, name, color), creator:users!created_by(id, name, email), " +
  "meeting_attendees(user_id, response, users!user_id(id, name, email))";

const shape = (m) => {
  const { meeting_attendees, teams, projects, ...rest } = m;
  return {
    ...rest,
    team: teams || null,
    project: projects || null,
    attendees: (meeting_attendees || []).map((a) => ({ ...a.users, response: a.response })),
  };
};

// What one person may do with one meeting
const meetingAccess = async (meeting, userId) => {
  const none = { canView: false, canEdit: false, canNote: false };
  if (!meeting) return none;
  const member = await getCompanyMember(meeting.company_id, userId);
  if (!member) return none;
  const { data: me } = await supabase
    .from("meeting_attendees").select("user_id").eq("meeting_id", meeting.id).eq("user_id", userId).maybeSingle();
  const organiser = meeting.created_by === userId;
  const attendee = !!me;
  let canView = organiser || attendee;
  if (!canView && !meeting.private) {
    // a team's meetings are open to the team; admins see every non-private meeting
    canView = isCompanyAdmin(member) || (meeting.team_id ? (await teamAccess(meeting.team_id, userId)).canView : false);
  }
  const writer = member.role !== "viewer";
  return {
    canView,
    canEdit: organiser || (isCompanyAdmin(member) && !meeting.private), // time, title, people
    canNote: canView && writer && (organiser || attendee),             // notes, items, votes
    member,
  };
};

const loadWithAccess = async (req, res, need = "canView") => {
  if (!UUID_RE.test(req.params.id)) {
    res.status(404).json({ error: "Meeting not found" });
    return null;
  }
  const { data: meeting } = await supabase.from("meetings").select("*").eq("id", req.params.id).maybeSingle();
  const access = await meetingAccess(meeting, req.user.id);
  if (!access.canView) {
    res.status(404).json({ error: "Meeting not found" });
    return null;
  }
  if (!access[need]) {
    res.status(403).json({ error: need === "canEdit" ? "Only the organiser can change this" : "Only attendees can add to this meeting" });
    return null;
  }
  return { meeting, access };
};

// Attendee ids -> only active, non-viewer members of the company (guests if on the project)
const cleanAttendees = async (companyId, ids, projectId) => {
  if (!Array.isArray(ids)) return { error: "attendee_ids must be a list" };
  const unique = [...new Set(ids.filter((id) => UUID_RE.test(String(id))))].slice(0, 100);
  if (!unique.length) return { ids: [] };
  const { data: members } = await supabase
    .from("company_members").select("user_id, role").eq("company_id", companyId).eq("status", "active").in("user_id", unique);
  const ok = [];
  for (const m of members || []) {
    if (m.role === "viewer") continue;
    if (m.role === "guest") {
      if (!projectId) continue;
      const { data: pm } = await supabase.from("project_members").select("id").eq("project_id", projectId).eq("user_id", m.user_id).maybeSingle();
      if (!pm) continue;
    }
    ok.push(m.user_id);
  }
  if (ok.length !== unique.length) return { error: "Some attendees aren't in this company (or can't join this meeting)" };
  return { ids: ok };
};

const readMeeting = (body, partial) => {
  const f = {};
  if (!partial || body.title !== undefined) {
    const title = String(body.title || "").trim().slice(0, 200);
    if (!title) return { error: "Give the meeting a title" };
    f.title = title;
  }
  if (!partial || body.kind !== undefined) {
    const kind = body.kind || "meeting";
    if (!KINDS.includes(kind)) return { error: "Unknown kind of meeting" };
    f.kind = kind;
  }
  if (!partial || body.starts_at !== undefined) {
    const t = new Date(body.starts_at);
    if (!body.starts_at || Number.isNaN(t.getTime())) return { error: "Pick a start time" };
    f.starts_at = t.toISOString();
  }
  if (body.duration_min !== undefined) {
    const d = parseInt(body.duration_min, 10);
    if (!(d >= 5 && d <= 600)) return { error: "Length must be 5 to 600 minutes" };
    f.duration_min = d;
  }
  if (body.location !== undefined) f.location = String(body.location || "").trim().slice(0, 500) || null;
  if (body.agenda !== undefined) f.agenda = String(body.agenda || "").slice(0, 20000);
  if (body.notes !== undefined) f.notes = String(body.notes || "").slice(0, 50000);
  if (body.private !== undefined) f.private = !!body.private;
  if (body.recurrence !== undefined) {
    const r = body.recurrence || null;
    if (r && !RECURRENCES.includes(r)) return { error: "Repeat must be weekly, biweekly or monthly" };
    f.recurrence = r;
  }
  if (body.status !== undefined) {
    if (!["scheduled", "done", "cancelled"].includes(body.status)) return { error: "Invalid status" };
    f.status = body.status;
  }
  return { fields: f };
};

// ── GET /meetings?from=&to=&team_id= ─────────────────────────────────────────
// Meetings I organise or attend, plus non-private ones of my teams.
export const getMeetings = async (req, res) => {
  if (!req.company) return res.json([]);
  const me = req.user.id;
  const from = req.query.from ? new Date(req.query.from) : new Date(Date.now() - 30 * 86400000);
  const to = req.query.to ? new Date(req.query.to) : new Date(Date.now() + 90 * 86400000);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return res.status(400).json({ error: "Bad date range" });

  const [{ data: mine }, { data: myTeams }] = await Promise.all([
    supabase.from("meeting_attendees").select("meeting_id").eq("user_id", me),
    supabase.from("team_members").select("team_id").eq("user_id", me),
  ]);
  const parts = [`created_by.eq.${me}`];
  const ids = (mine || []).map((m) => m.meeting_id);
  if (ids.length) parts.push(`id.in.(${ids.join(",")})`);
  const teamIds = (myTeams || []).map((t) => t.team_id);
  if (teamIds.length) parts.push(`and(private.eq.false,team_id.in.(${teamIds.join(",")}))`);
  if (isCompanyAdmin(req.company.member)) parts.push("private.eq.false");

  let q = supabase.from("meetings").select(MEETING_SELECT)
    .eq("company_id", req.company.id)
    .gte("starts_at", from.toISOString()).lte("starts_at", to.toISOString())
    .or(parts.join(","));
  if (req.query.team_id && UUID_RE.test(req.query.team_id)) q = q.eq("team_id", req.query.team_id);
  const { data, error } = await q.order("starts_at").limit(500);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map(shape).map((m) => ({ ...m, my_response: m.attendees.find((a) => a.id === me)?.response || null })));
};

// ── POST /meetings ───────────────────────────────────────────────────────────
// { title, kind, starts_at, duration_min, location, agenda?, attendee_ids[], team_id?, project_id?, recurrence?, private? }
export const createMeeting = async (req, res) => {
  if (!req.company) return res.status(400).json({ error: "Meetings live in a company — switch to one first" });
  const member = req.company.member;
  if (member.role === "viewer") return res.status(403).json({ error: "Viewers can't schedule meetings" });
  const { fields, error: invalid } = readMeeting(req.body, false);
  if (invalid) return res.status(400).json({ error: invalid });

  if (req.body.team_id) {
    const access = UUID_RE.test(req.body.team_id) ? await teamAccess(req.body.team_id, req.user.id) : { canView: false };
    if (!access.canView || access.team.company_id !== req.company.id) return res.status(400).json({ error: "You're not on that team" });
    fields.team_id = req.body.team_id;
  }
  if (req.body.project_id) {
    const { data: p } = UUID_RE.test(req.body.project_id)
      ? await supabase.from("projects").select("id, team_id").eq("id", req.body.project_id).eq("company_id", req.company.id).maybeSingle()
      : { data: null };
    if (!p) return res.status(400).json({ error: "Project not found" });
    fields.project_id = p.id;
    fields.team_id = fields.team_id || p.team_id;
  }
  if (member.role === "guest" && !fields.project_id) return res.status(403).json({ error: "Guests can only meet about their project" });

  const people = await cleanAttendees(req.company.id, req.body.attendee_ids || [], fields.project_id);
  if (people.error) return res.status(400).json({ error: people.error });
  const attendeeIds = [...new Set([req.user.id, ...people.ids])];
  if (fields.kind === "one_on_one") {
    if (attendeeIds.length !== 2) return res.status(400).json({ error: "A 1:1 is you and one other person" });
    fields.private = true; // 1:1 notes are only for the two of you
  }
  if (!fields.agenda) fields.agenda = TEMPLATES[fields.kind];

  const row = { ...fields, company_id: req.company.id, created_by: req.user.id };
  const { data: meeting, error } = await supabase.from("meetings").insert([row]).select().single();
  if (error) return res.status(500).json({ error: error.message });
  if (meeting.recurrence) await supabase.from("meetings").update({ series_id: meeting.id }).eq("id", meeting.id);
  await supabase.from("meeting_attendees").insert(attendeeIds.map((uid) => ({
    meeting_id: meeting.id, user_id: uid, response: uid === req.user.id ? "yes" : "pending",
  })));

  const when = new Date(meeting.starts_at).toUTCString().slice(0, 22);
  await notify(req.user.id, attendeeIds.map((uid) => ({
    user_id: uid, type: "meeting", link: `/meetings/${meeting.id}`, message: `Invited: ${meeting.title} (${when} UTC)`,
  })));
  await audit(req, req.company.id, "meeting.created", "meeting", meeting.id, { title: meeting.title, kind: meeting.kind });
  res.status(201).json(await fullMeeting(meeting.id, req.user.id));
};

// One meeting with people, items and what I can do
const fullMeeting = async (id, userId) => {
  const { data } = await supabase.from("meetings").select(MEETING_SELECT).eq("id", id).single();
  const { data: items } = await supabase
    .from("meeting_items").select("*, assignee:users!assignee_id(id, name, email)")
    .eq("meeting_id", id).order("position").order("created_at");
  const access = await meetingAccess(data, userId);
  const m = shape(data);
  // earlier meetings in the same series (for "last time" in 1:1s)
  const { data: previous } = m.series_id
    ? await supabase.from("meetings").select("id, starts_at, status").eq("series_id", m.series_id).lt("starts_at", m.starts_at)
        .order("starts_at", { ascending: false }).limit(5)
    : { data: [] };
  return {
    ...m,
    items: (items || []).map((i) => ({ ...i, vote_count: i.votes.length, voted: i.votes.includes(userId), votes: undefined })),
    previous: previous || [],
    my_response: m.attendees.find((a) => a.id === userId)?.response || null,
    can_edit: access.canEdit,
    can_note: access.canNote,
  };
};

// ── GET /meetings/:id ────────────────────────────────────────────────────────
export const getMeeting = async (req, res) => {
  const ctx = await loadWithAccess(req, res);
  if (!ctx) return;
  res.json(await fullMeeting(ctx.meeting.id, req.user.id));
};

// ── PUT /meetings/:id ────────────────────────────────────────────────────────
// Organiser: anything. Attendees: agenda and notes only.
export const updateMeeting = async (req, res) => {
  const ctx = await loadWithAccess(req, res, "canNote");
  if (!ctx) return;
  const { fields, error: invalid } = readMeeting(req.body, true);
  if (invalid) return res.status(400).json({ error: invalid });
  const organiserOnly = Object.keys(fields).filter((k) => !["agenda", "notes"].includes(k));
  if ((organiserOnly.length || req.body.attendee_ids) && !ctx.access.canEdit)
    return res.status(403).json({ error: "Only the organiser can change the time, title or people" });
  if (ctx.meeting.kind === "one_on_one" || fields.kind === "one_on_one") fields.private = true;

  if (req.body.attendee_ids) {
    const people = await cleanAttendees(ctx.meeting.company_id, req.body.attendee_ids, ctx.meeting.project_id);
    if (people.error) return res.status(400).json({ error: people.error });
    const want = new Set([ctx.meeting.created_by, ...people.ids].filter(Boolean));
    const { data: current } = await supabase.from("meeting_attendees").select("user_id").eq("meeting_id", ctx.meeting.id);
    const have = new Set((current || []).map((a) => a.user_id));
    const added = [...want].filter((u) => !have.has(u));
    const removed = [...have].filter((u) => !want.has(u));
    if (removed.length) await supabase.from("meeting_attendees").delete().eq("meeting_id", ctx.meeting.id).in("user_id", removed);
    if (added.length) {
      await supabase.from("meeting_attendees").insert(added.map((uid) => ({ meeting_id: ctx.meeting.id, user_id: uid })));
      await notify(req.user.id, added.map((uid) => ({
        user_id: uid, type: "meeting", link: `/meetings/${ctx.meeting.id}`, message: `Invited: ${ctx.meeting.title}`,
      })));
    }
  }
  if (fields.starts_at && fields.starts_at !== ctx.meeting.starts_at) fields.reminded_at = null;
  if (fields.recurrence && !ctx.meeting.series_id) fields.series_id = ctx.meeting.id;

  if (Object.keys(fields).length) {
    const { error } = await supabase.from("meetings")
      .update({ ...fields, updated_at: new Date().toISOString() }).eq("id", ctx.meeting.id);
    if (error) return res.status(500).json({ error: error.message });
  }
  // tell people when it moves or is cancelled
  const moved = fields.starts_at && new Date(fields.starts_at).getTime() !== new Date(ctx.meeting.starts_at).getTime();
  if (moved || fields.status === "cancelled") {
    const { data: att } = await supabase.from("meeting_attendees").select("user_id").eq("meeting_id", ctx.meeting.id);
    await notify(req.user.id, (att || []).map((a) => ({
      user_id: a.user_id, type: "meeting", link: `/meetings/${ctx.meeting.id}`,
      message: fields.status === "cancelled" ? `Cancelled: ${ctx.meeting.title}` : `Moved: ${ctx.meeting.title}`,
    })));
  }
  const full = await fullMeeting(ctx.meeting.id, req.user.id);
  res.json(full);
  sendTo(full.attendees.map((a) => a.id), "meeting", { id: full.id });
};

// ── DELETE /meetings/:id — organiser (or admin); ?series=1 deletes upcoming ones too
export const deleteMeeting = async (req, res) => {
  const ctx = await loadWithAccess(req, res, "canEdit");
  if (!ctx) return;
  if (req.query.series && ctx.meeting.series_id) {
    await supabase.from("meetings").delete().eq("series_id", ctx.meeting.series_id).gte("starts_at", ctx.meeting.starts_at);
  } else {
    await supabase.from("meetings").delete().eq("id", ctx.meeting.id);
  }
  await audit(req, ctx.meeting.company_id, "meeting.deleted", "meeting", ctx.meeting.id, { title: ctx.meeting.title });
  res.json({ success: true });
};

// ── POST /meetings/:id/respond { response: yes|no|maybe } ────────────────────
export const respondToMeeting = async (req, res) => {
  const ctx = await loadWithAccess(req, res);
  if (!ctx) return;
  if (!["yes", "no", "maybe"].includes(req.body.response)) return res.status(400).json({ error: "Answer yes, no or maybe" });
  const { data } = await supabase.from("meeting_attendees").update({ response: req.body.response })
    .eq("meeting_id", ctx.meeting.id).eq("user_id", req.user.id).select("user_id");
  if (!data?.length) return res.status(400).json({ error: "You're not invited to this meeting" });
  if (ctx.meeting.created_by && req.body.response === "no") {
    const { data: me } = await supabase.from("users").select("name, email").eq("id", req.user.id).single();
    await notify(req.user.id, [{
      user_id: ctx.meeting.created_by, type: "meeting", link: `/meetings/${ctx.meeting.id}`,
      message: `${me.name || me.email} can't make ${ctx.meeting.title}`,
    }]);
  }
  res.json({ success: true });
};

// ── Items: topics, decisions, actions, retro cards ───────────────────────────

const checkAssignee = async (companyId, userId) => {
  if (!userId) return null;
  const m = await getCompanyMember(companyId, userId);
  if (!m || m.role === "viewer") return "Pick someone in the company who can take tasks";
  return null;
};

// POST /meetings/:id/items { kind, text, assignee_id?, due_date? }
export const addItem = async (req, res) => {
  const ctx = await loadWithAccess(req, res, "canNote");
  if (!ctx) return;
  const kind = req.body.kind;
  if (!ITEM_KINDS.includes(kind)) return res.status(400).json({ error: "Unknown kind of item" });
  const text = String(req.body.text || "").trim().slice(0, 2000);
  if (!text) return res.status(400).json({ error: "Write something first" });
  const problem = await checkAssignee(ctx.meeting.company_id, req.body.assignee_id);
  if (problem) return res.status(400).json({ error: problem });
  if (req.body.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(req.body.due_date)) return res.status(400).json({ error: "Invalid due date" });
  const { count } = await supabase.from("meeting_items").select("id", { count: "exact", head: true }).eq("meeting_id", ctx.meeting.id);
  if (count >= 300) return res.status(400).json({ error: "This meeting has too many items" });
  const { data, error } = await supabase.from("meeting_items").insert([{
    meeting_id: ctx.meeting.id, kind, text, position: count || 0, created_by: req.user.id,
    assignee_id: kind === "action" ? req.body.assignee_id || null : null,
    due_date: kind === "action" ? req.body.due_date || null : null,
  }]).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
};

const loadItem = async (meetingId, itemId) => {
  if (!UUID_RE.test(itemId || "")) return null;
  const { data } = await supabase.from("meeting_items").select("*").eq("id", itemId).eq("meeting_id", meetingId).maybeSingle();
  return data;
};

// PUT /meetings/:id/items/:itemId { text?, done?, assignee_id?, due_date? }
export const updateItem = async (req, res) => {
  const ctx = await loadWithAccess(req, res, "canNote");
  if (!ctx) return;
  const item = await loadItem(ctx.meeting.id, req.params.itemId);
  if (!item) return res.status(404).json({ error: "Item not found" });
  const u = {};
  if (req.body.text !== undefined) {
    const text = String(req.body.text || "").trim().slice(0, 2000);
    if (!text) return res.status(400).json({ error: "An item needs some text" });
    u.text = text;
  }
  if (req.body.done !== undefined) u.done = !!req.body.done;
  if (req.body.assignee_id !== undefined) {
    const problem = await checkAssignee(ctx.meeting.company_id, req.body.assignee_id);
    if (problem) return res.status(400).json({ error: problem });
    u.assignee_id = req.body.assignee_id || null;
  }
  if (req.body.due_date !== undefined) {
    if (req.body.due_date && !/^\d{4}-\d{2}-\d{2}$/.test(req.body.due_date)) return res.status(400).json({ error: "Invalid due date" });
    u.due_date = req.body.due_date || null;
  }
  const { data, error } = await supabase.from("meeting_items").update(u).eq("id", item.id).select().single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
};

// DELETE /meetings/:id/items/:itemId
export const deleteItem = async (req, res) => {
  const ctx = await loadWithAccess(req, res, "canNote");
  if (!ctx) return;
  await supabase.from("meeting_items").delete().eq("id", req.params.itemId).eq("meeting_id", ctx.meeting.id);
  res.json({ success: true });
};

// POST /meetings/:id/items/:itemId/vote — toggle my vote on a retro card
export const voteItem = async (req, res) => {
  const ctx = await loadWithAccess(req, res, "canNote");
  if (!ctx) return;
  const item = await loadItem(ctx.meeting.id, req.params.itemId);
  if (!item || !["went_well", "to_improve", "idea", "topic"].includes(item.kind)) return res.status(404).json({ error: "Item not found" });
  const votes = item.votes.includes(req.user.id) ? item.votes.filter((v) => v !== req.user.id) : [...item.votes, req.user.id];
  await supabase.from("meeting_items").update({ votes }).eq("id", item.id);
  res.json({ vote_count: votes.length, voted: votes.includes(req.user.id) });
};

// Make a company task from an action item (once)
const actionToTask = async (meeting, item, actorId) => {
  if (item.task_id) return item.task_id;
  const assignee = item.assignee_id || actorId;
  const { data: person } = await supabase.from("users").select("timezone").eq("id", assignee).single();
  const { data: task, error } = await supabase.from("tasks").insert([{
    user_id: actorId,
    company_id: meeting.company_id,
    team_id: meeting.team_id,
    project_id: meeting.project_id,
    assignee_id: assignee,
    title: item.text.slice(0, 300),
    description: `From meeting: ${meeting.title}`,
    status: "Doing",
    date_logged: todayIn(person?.timezone),
    due_date: item.due_date,
  }]).select("id, title").single();
  if (error) throw error;
  await supabase.from("meeting_items").update({ task_id: task.id }).eq("id", item.id);
  await notify(actorId, [{ user_id: assignee, type: "assigned", task_id: task.id, link: `/tasks/${task.id}`, message: `From ${meeting.title}: "${task.title}"` }]);
  return task.id;
};

// POST /meetings/:id/items/:itemId/task — turn an action item into a task
export const itemToTask = async (req, res) => {
  const ctx = await loadWithAccess(req, res, "canNote");
  if (!ctx) return;
  const item = await loadItem(ctx.meeting.id, req.params.itemId);
  if (!item || item.kind !== "action") return res.status(404).json({ error: "Action item not found" });
  if (item.assignee_id && ctx.meeting.project_id) {
    // a guest assignee must be on the meeting's project (same rule as tasks)
    const m = await getCompanyMember(ctx.meeting.company_id, item.assignee_id);
    if (m?.role === "guest") {
      const { data: pm } = await supabase.from("project_members").select("id").eq("project_id", ctx.meeting.project_id).eq("user_id", m.user_id).maybeSingle();
      if (!pm) return res.status(400).json({ error: "That guest isn't on the project" });
    }
  }
  try {
    const taskId = await actionToTask(ctx.meeting, item, req.user.id);
    res.status(201).json({ task_id: taskId });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// ── POST /meetings/:id/finish { create_tasks?: true } ────────────────────────
// Marks it done, turns action items into tasks, and sends everyone the summary.
export const finishMeeting = async (req, res) => {
  const ctx = await loadWithAccess(req, res, "canNote");
  if (!ctx) return;
  const { meeting } = ctx;
  const { data: items } = await supabase.from("meeting_items").select("*").eq("meeting_id", meeting.id).order("position");
  let created = 0;
  if (req.body?.create_tasks !== false) {
    for (const item of (items || []).filter((i) => i.kind === "action" && !i.task_id && !i.done)) {
      try {
        await actionToTask(meeting, item, req.user.id);
        created++;
      } catch {
        // skip items that can't become tasks (e.g. assignee left)
      }
    }
  }
  await supabase.from("meetings").update({ status: "done", updated_at: new Date().toISOString() }).eq("id", meeting.id);
  const decisionsLogged = await logMeetingDecisions(meeting, req.user.id);

  // summary to attendees, once
  const { data: claimed } = await supabase.from("meetings").update({ summary_sent_at: new Date().toISOString() })
    .eq("id", meeting.id).is("summary_sent_at", null).select("id");
  if (claimed?.length) {
    const { data: fresh } = await supabase.from("meeting_items").select("*, assignee:users!assignee_id(name, email)").eq("meeting_id", meeting.id).order("position");
    const decisions = (fresh || []).filter((i) => i.kind === "decision").map((i) => `- ${i.text}`);
    const actions = (fresh || []).filter((i) => i.kind === "action").map((i) => `- ${i.text}${i.assignee ? ` (${i.assignee.name || i.assignee.email})` : ""}${i.due_date ? `, due ${i.due_date}` : ""}`);
    const body = [
      `Summary of "${meeting.title}"`,
      decisions.length ? `\nDecisions:\n${decisions.join("\n")}` : "",
      actions.length ? `\nAction items:\n${actions.join("\n")}` : "",
      meeting.notes ? `\nNotes:\n${meeting.notes.slice(0, 4000)}` : "",
      `\nOpen the meeting: ${appLink(`/meetings/${meeting.id}`)}`,
    ].join("\n");
    const { data: att } = await supabase.from("meeting_attendees").select("users!user_id(id, email)").eq("meeting_id", meeting.id);
    // emails go out in the background, so a slow mail server never holds up the page
    Promise.all((att || []).filter((a) => a.users?.email).map((a) => sendEmail(a.users.email, `Notes: ${meeting.title}`, body))).catch(() => {});
    await notify(req.user.id, (att || []).map((a) => ({
      user_id: a.users.id, type: "meeting", link: `/meetings/${meeting.id}`,
      message: `Notes from ${meeting.title}: ${decisions.length} decision(s), ${actions.length} action(s)`,
    })));
  }
  res.json({ success: true, tasks_created: created, decisions_logged: decisionsLogged, ...(await fullMeeting(meeting.id, req.user.id)) });
};

// ── GET /meetings/:id/ics — add to any calendar app ─────────────────────────
const icsDate = (d) => new Date(d).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (s) => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/[,;]/g, (c) => `\\${c}`);
export const meetingIcs = async (req, res) => {
  const ctx = await loadWithAccess(req, res);
  if (!ctx) return;
  const m = ctx.meeting;
  const end = new Date(new Date(m.starts_at).getTime() + m.duration_min * 60000);
  const rule = { weekly: "FREQ=WEEKLY", biweekly: "FREQ=WEEKLY;INTERVAL=2", monthly: "FREQ=MONTHLY" }[m.recurrence];
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Taskflow//Meetings//EN", "BEGIN:VEVENT",
    `UID:${m.id}@taskflow`, `DTSTAMP:${icsDate(new Date())}`, `DTSTART:${icsDate(m.starts_at)}`, `DTEND:${icsDate(end)}`,
    `SUMMARY:${icsText(m.title)}`, `DESCRIPTION:${icsText(`${m.agenda}\n\n${appLink(`/meetings/${m.id}`)}`)}`,
    ...(m.location ? [`LOCATION:${icsText(m.location)}`] : []),
    ...(rule ? [`RRULE:${rule}`] : []),
    ...(m.status === "cancelled" ? ["STATUS:CANCELLED"] : []),
    "END:VEVENT", "END:VCALENDAR",
  ];
  res.setHeader("Content-Type", "text/calendar; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="meeting.ics"`);
  res.send(lines.join("\r\n"));
};

// ── Jobs ─────────────────────────────────────────────────────────────────────

// Every 5 minutes: remind attendees ~15 minutes before
export const runMeetingReminderJob = async () => {
  const now = Date.now();
  const { data } = await supabase.from("meetings").select("id, title, starts_at, location")
    .eq("status", "scheduled").is("reminded_at", null)
    .gte("starts_at", new Date(now).toISOString()).lte("starts_at", new Date(now + 15 * 60000).toISOString());
  for (const m of data || []) {
    const { data: claimed } = await supabase.from("meetings").update({ reminded_at: new Date().toISOString() })
      .eq("id", m.id).is("reminded_at", null).select("id");
    if (!claimed?.length) continue;
    const { data: att } = await supabase.from("meeting_attendees").select("user_id").eq("meeting_id", m.id).neq("response", "no");
    const mins = Math.max(1, Math.round((new Date(m.starts_at).getTime() - now) / 60000));
    await notify(null, (att || []).map((a) => ({
      user_id: a.user_id, type: "meeting", link: `/meetings/${m.id}`, message: `${m.title} starts in ${mins} min`,
    })));
  }
};

const nextStart = (iso, rule) => {
  const d = new Date(iso);
  if (rule === "weekly") d.setUTCDate(d.getUTCDate() + 7);
  else if (rule === "biweekly") d.setUTCDate(d.getUTCDate() + 14);
  else if (rule === "monthly") d.setUTCMonth(d.getUTCMonth() + 1);
  return d.toISOString();
};

// Hourly: keep the next meeting of each repeating series scheduled. Unfinished
// topics and open action items carry over, so a 1:1 picks up where it left off.
export const runMeetingSeriesJob = async () => {
  const { data: latest } = await supabase.from("meetings").select("*")
    .not("recurrence", "is", null).not("series_id", "is", null).neq("status", "cancelled")
    .lt("starts_at", new Date().toISOString())
    .order("starts_at", { ascending: false });
  const seen = new Set();
  let created = 0;
  for (const m of latest || []) {
    if (seen.has(m.series_id)) continue;
    seen.add(m.series_id);
    // only when nothing in the series is upcoming
    const { count } = await supabase.from("meetings").select("id", { count: "exact", head: true })
      .eq("series_id", m.series_id).gte("starts_at", new Date().toISOString());
    if (count) continue;
    let start = nextStart(m.starts_at, m.recurrence);
    while (new Date(start).getTime() < Date.now()) start = nextStart(start, m.recurrence); // skip missed ones
    const { id: _id, created_at: _c, updated_at: _u, reminded_at: _r, summary_sent_at: _s, notes: _n, status: _st, ...copy } = m;
    const { data: next, error } = await supabase.from("meetings")
      .insert([{ ...copy, starts_at: start, status: "scheduled", notes: "" }]).select().single();
    if (error) continue; // another run made it already
    const { data: att } = await supabase.from("meeting_attendees").select("user_id, response").eq("meeting_id", m.id);
    if (att?.length) await supabase.from("meeting_attendees").insert(att.map((a) => ({ meeting_id: next.id, user_id: a.user_id })));
    const { data: open } = await supabase.from("meeting_items").select("*").eq("meeting_id", m.id)
      .in("kind", ["topic", "action"]).eq("done", false).is("task_id", null);
    if (open?.length)
      await supabase.from("meeting_items").insert(open.map((i, idx) => ({
        meeting_id: next.id, kind: i.kind, text: i.text, assignee_id: i.assignee_id, due_date: i.due_date, position: idx, created_by: i.created_by,
      })));
    created++;
  }
  if (created) console.log(`[Cron] meetings: scheduled ${created} next occurrence(s)`);
};
