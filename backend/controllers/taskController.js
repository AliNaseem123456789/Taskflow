import { supabase } from "../config/supabase.js";
import { todayIn, dayNumber, monthRange, addDays } from "../utils/time.js";
import { sendTo, publishToTeam } from "../utils/events.js";
import { syncTaskToGoogle } from "./integrationController.js";
import { notify } from "./notificationController.js";
import { taskExtras } from "./taskDetailController.js";
import { ensureStatuses, legacyStatus, statusIdForLegacy } from "../utils/projectStatuses.js";
import {
  can,
  getCompanyMember,
  taskScope,
  scopeFilter,
  scopeAllows,
  taskAccess,
  myWorkFilter,
} from "../utils/permissions.js";

// Tell whoever is looking at this task's team (or just the owner) it changed
const announce = (task, action) => {
  if (!task) return;
  const data = { action, id: task.id };
  if (task.team_id) publishToTeam(task.team_id, "task", data).catch(() => {});
  sendTo([task.user_id, task.assignee_id].filter(Boolean), "task", data);
};

// Full select with tags, reactions, project and the people on it.
// (users is joined twice, so each join names its column.)
const TASK_SELECT =
  "*, projects(id, name, color), task_tags(tags(id, name, color)), task_reactions(user_id, emoji), " +
  "creator:users!user_id(id, name, email), assignee:users!assignee_id(id, name, email), reviewer:users!reviewer_id(id, name, email)";

export const normaliseTasks = (data) =>
  data.map((t) => ({
    ...t,
    tags: t.task_tags?.map((tt) => tt.tags).filter(Boolean) || [],
    reactions: t.task_reactions || [],
    project: t.projects || null,
    projects: undefined,
    task_tags: undefined,
    task_reactions: undefined,
  }));

// ── Allowed values ────────────────────────────────────────────────────────────

const STATUSES = ["Done", "Doing", "Delayed"];
const PRIORITIES = ["low", "medium", "high", "urgent"];
const RECURRENCES = ["daily", "weekdays", "weekly", "monthly"];
const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const isUuid = (v) => /^[0-9a-f-]{36}$/i.test(v);

// Picks the task fields a client may set and checks them.
// Returns { fields } or { error }.
const readTaskFields = (body, { requireTitle = false } = {}) => {
  const fields = {};

  if (body.title !== undefined || requireTitle) {
    const title = String(body.title || "").trim();
    if (!title) return { error: "Title is required" };
    fields.title = title.slice(0, 300);
  }
  if (body.description !== undefined) fields.description = body.description || null;

  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return { error: "Invalid status" };
    fields.status = body.status;
  }
  if (body.priority !== undefined) {
    if (!PRIORITIES.includes(body.priority)) return { error: "Invalid priority" };
    fields.priority = body.priority;
  }
  if (body.recurrence !== undefined) {
    const r = body.recurrence || null;
    if (r && !RECURRENCES.includes(r)) return { error: "Invalid repeat option" };
    fields.recurrence = r;
  }
  if (body.due_date !== undefined) {
    if (body.due_date && !isDate(body.due_date)) return { error: "Invalid due date" };
    fields.due_date = body.due_date || null;
  }
  if (body.date_logged !== undefined && body.date_logged) {
    if (!isDate(body.date_logged)) return { error: "Invalid date" };
    fields.date_logged = body.date_logged;
  }
  if (body.estimate !== undefined) {
    const e = body.estimate === null || body.estimate === "" ? null : Number(body.estimate);
    if (e !== null && !(e >= 0 && e <= 10000)) return { error: "Estimate must be a number from 0 to 10000" };
    fields.estimate = e === null ? null : Math.round(e * 10) / 10;
  }
  if (body.start_date !== undefined) {
    if (body.start_date && !isDate(body.start_date)) return { error: "Invalid start date" };
    fields.start_date = body.start_date || null;
  }
  for (const key of ["project_id", "team_id", "assignee_id", "reviewer_id", "status_id", "sprint_id"]) {
    if (body[key] === undefined) continue;
    if (body[key] && !isUuid(String(body[key]))) return { error: `Invalid ${key}` };
    fields[key] = body[key] || null;
  }
  if (body.parent_task_id !== undefined) {
    const parent = body.parent_task_id;
    if (parent !== null && parent !== "" && !/^\d+$/.test(String(parent))) return { error: "Invalid parent task" };
    fields.parent_task_id = parent ? Number(parent) : null;
  }
  if (body.blocker !== undefined) {
    const b = String(body.blocker || "").trim();
    fields.blocker = b || null;
  }
  return { fields };
};

// Company task: check the team, project and assignee it's being put on.
// Mutates `fields` (project decides the team). Returns an error string or null.
const checkPlacement = async (fields, member, existing = null) => {
  const companyId = member.company_id;
  const scope = await taskScope(member);
  const projectId = fields.project_id !== undefined ? fields.project_id : existing?.project_id;

  if (fields.project_id) {
    const { data: p } = await supabase
      .from("projects").select("id, team_id, company_id").eq("id", fields.project_id).maybeSingle();
    if (!p || p.company_id !== companyId) return "That project isn't in this company";
    if (!(scope.all || scope.projectIds.includes(p.id) || scope.teamIds.includes(p.team_id)))
      return "You can't add tasks to that project";
    fields.team_id = p.team_id;
  } else if (fields.team_id) {
    const { data: t } = await supabase.from("teams").select("id, company_id").eq("id", fields.team_id).maybeSingle();
    if (!t || t.company_id !== companyId) return "That team isn't in this company";
    if (!(scope.all || scope.teamIds.includes(t.id))) return "You're not on that team";
  }

  if (member.role === "guest" && !projectId) return "Guests can only add tasks to projects shared with them";

  for (const [key, label] of [["assignee_id", "assignee"], ["reviewer_id", "reviewer"]]) {
    if (!fields[key]) continue;
    const a = await getCompanyMember(companyId, fields[key]);
    if (!a) return `The ${label} isn't in this company`;
    if (a.role === "viewer") return `Viewers can't be the ${label}`;
    if (a.role === "guest") {
      const { data: pm } = projectId
        ? await supabase.from("project_members").select("id").eq("project_id", projectId).eq("user_id", a.user_id).maybeSingle()
        : { data: null };
      if (!pm) return `Guests can only be the ${label} in projects shared with them`;
    }
  }

  // sprint: an open sprint of the task's team
  if (fields.sprint_id) {
    const teamId = fields.team_id !== undefined ? fields.team_id : existing?.team_id;
    const { data: sp } = await supabase.from("sprints").select("id, team_id, status").eq("id", fields.sprint_id).maybeSingle();
    if (!sp || sp.team_id !== teamId) return "That sprint belongs to another team";
    if (sp.status === "closed") return "That sprint is closed";
  } else if (fields.team_id !== undefined && existing?.sprint_id && fields.team_id !== existing.team_id) {
    fields.sprint_id = null; // moved to another team: leaves the old team's sprint
  }

  // board column: must be one of the project's columns; it decides the plain status
  const projectChanged = fields.project_id !== undefined && fields.project_id !== (existing?.project_id ?? null);
  if (fields.status_id) {
    if (!projectId) return "Only project tasks have columns";
    const { data: col } = await supabase
      .from("project_statuses").select("id, category").eq("id", fields.status_id).eq("project_id", projectId).maybeSingle();
    if (!col) return "That column isn't in this project";
    fields.status = legacyStatus(col.category);
  } else if (projectChanged) {
    fields.status_id = null; // lands in the column matching its status
  } else if (fields.status && projectId && existing) {
    const keep = statusIdForLegacy(fields.status, existing.status_id, await ensureStatuses(projectId));
    if (keep !== undefined) fields.status_id = keep;
  }
  return null;
};

// Tell people about who's now on a task, and about it being finished
const notifyChanges = async (actorId, task, before = {}) => {
  const items = [];
  const link = `/tasks/${task.id}`;
  if (task.assignee_id && task.assignee_id !== before.assignee_id)
    items.push({ user_id: task.assignee_id, type: "assigned", task_id: task.id, link, message: `You were assigned "${task.title}"` });
  if (task.reviewer_id && task.reviewer_id !== before.reviewer_id)
    items.push({ user_id: task.reviewer_id, type: "review", task_id: task.id, link, message: `You're the reviewer on "${task.title}"` });
  if (task.status === "Done" && before.status && before.status !== "Done") {
    const { data: watchers } = await supabase.from("task_watchers").select("user_id").eq("task_id", task.id);
    const told = new Set(items.map((i) => i.user_id));
    for (const uid of [task.user_id, task.reviewer_id, ...(watchers || []).map((w) => w.user_id)])
      if (uid && !told.has(uid)) {
        told.add(uid);
        items.push({ user_id: uid, type: "done", task_id: task.id, link, message: `"${task.title}" is done` });
      }
  }
  if (items.length) await notify(actorId, items);
};

// Only tag ids that belong to this user
const ownTagIds = async (userId, tagIds) => {
  if (!Array.isArray(tagIds) || !tagIds.length) return [];
  const { data } = await supabase.from("tags").select("id").eq("user_id", userId).in("id", tagIds);
  return (data || []).map((t) => t.id);
};

export const loadTask = async (id) => {
  const { data } = await supabase.from("tasks").select(TASK_SELECT).eq("id", id).single();
  return data ? normaliseTasks([data])[0] : null;
};

// "Which tasks you may see" for the chosen workspace:
// Personal = my personal tasks + everything assigned to me anywhere;
// Company = that company's tasks within my role's reach.
// (Worked out first, then applied: a query builder must not pass through an
// async function's return, or awaiting it runs the query.)
const workspaceScope = async (req) =>
  req.company ? await taskScope(req.company.member) : null;

const inWorkspace = (query, req, scope) => {
  if (!req.company) return query.or(myWorkFilter(req.user.id));
  query = query.eq("company_id", req.company.id);
  return scope.all ? query : query.or(scopeFilter(scope, req.user.id));
};

// ── GET /tasks ────────────────────────────────────────────────────────────────
// ?date=YYYY-MM-DD | ?month=YYYY-MM | ?start=&end= | ?open=1 (not Done, any date)
// in a company also: &team_id= &project_id= &assignee=me|<user id>

export const getTasks = async (req, res) => {
  const { date, month, start, end, open, team_id, project_id, assignee } = req.query;
  try {
    let query = inWorkspace(supabase.from("tasks").select(TASK_SELECT), req, await workspaceScope(req));

    if (date) {
      query = query.eq("date_logged", date);
    } else if (month) {
      const range = monthRange(month);
      query = query.gte("date_logged", range.start).lte("date_logged", range.end);
    } else if (start && end) {
      query = query.gte("date_logged", start).lte("date_logged", end);
    }
    if (open) query = query.neq("status", "Done");
    if (team_id && isUuid(team_id)) query = query.eq("team_id", team_id);
    if (project_id && isUuid(project_id)) query = query.eq("project_id", project_id);
    if (assignee) query = query.eq("assignee_id", assignee === "me" ? req.user.id : assignee);
    if (req.query.top) query = query.is("parent_task_id", null);
    if (req.query.sprint_id && isUuid(req.query.sprint_id)) query = query.eq("sprint_id", req.query.sprint_id);

    const { data, error } = await query.order("date_logged", { ascending: true });
    if (error) throw error;
    res.json(normaliseTasks(data));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// ── GET /tasks/:id ────────────────────────────────────────────────────────────
// Anyone allowed to see it (used by notification links)

export const getTask = async (req, res) => {
  try {
    const task = await loadTask(req.params.id);
    const access = await taskAccess(task, req.user.id);
    if (!access.canView) return res.status(404).json({ error: "Task not found" });

    let company = null;
    if (task.company_id) {
      const { data } = await supabase.from("companies").select("id, name").eq("id", task.company_id).single();
      company = data;
    }
    res.json({
      ...task,
      ...(await taskExtras(task, req.user.id)),
      owner: task.creator, // older pages read `owner`
      company,
      permissions: {
        canEdit: access.canEdit,
        canDelete: access.canDelete,
        canAssign: access.canAssign,
        canComment: access.canComment,
      },
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// ── GET /tasks/search ─────────────────────────────────────────────────────────
// ?q=text (title + description) &status= &priority= &tag=<tag id> &from= &to=

export const searchTasks = async (req, res) => {
  const { q, status, priority, tag, from, to } = req.query;
  const text = q?.trim();
  if (!text && !status && !priority && !tag && !from && !to) return res.json([]);

  try {
    let query = inWorkspace(supabase.from("tasks").select(TASK_SELECT), req, await workspaceScope(req));

    if (text) {
      // quote the value so commas / brackets in the search don't break the filter
      const safe = text.replace(/[\\"]/g, "");
      query = query.or(`title.ilike."%${safe}%",description.ilike."%${safe}%"`);
    }
    if (status) query = query.eq("status", status);
    if (priority) query = query.eq("priority", priority);
    if (from) query = query.gte("date_logged", from);
    if (to) query = query.lte("date_logged", to);
    if (tag) {
      const { data: links } = await supabase.from("task_tags").select("task_id").eq("tag_id", tag);
      const ids = (links || []).map((l) => l.task_id);
      if (!ids.length) return res.json([]);
      query = query.in("id", ids);
    }

    const { data, error } = await query.order("date_logged", { ascending: false }).limit(100);
    if (error) throw error;
    res.json(normaliseTasks(data));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// ── GET /tasks/streak ─────────────────────────────────────────────────────────
// Always about you: your personal tasks + company tasks assigned to you.

export const getStreak = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("tasks")
      .select("date_logged")
      .or(myWorkFilter(req.user.id))
      .order("date_logged", { ascending: false });
    if (error) throw error;

    // Count back from today (in the user's timezone). A streak survives
    // until the end of today even if nothing has been logged yet today.
    const dates = [...new Set(data.map((t) => t.date_logged))].sort().reverse();
    let streak = 0;
    let expected = dayNumber(todayIn(req.user.timezone));

    for (const dateStr of dates) {
      const day = dayNumber(dateStr);
      const diff = expected - day;
      if (diff < 0) continue; // future-dated task
      if (diff <= 1) {
        streak++;
        expected = day;
      } else {
        break;
      }
    }

    res.json({ streak });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// ── GET /tasks/heatmap?days=365 ───────────────────────────────────────────────
// Your Done tasks per day, for the GitHub-style activity grid

export const getHeatmap = async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 365, 7), 730);
  const end = todayIn(req.user.timezone);
  const start = addDays(end, -(days - 1));
  try {
    const { data, error } = await supabase
      .from("tasks")
      .select("date_logged")
      .or(myWorkFilter(req.user.id))
      .eq("status", "Done")
      .gte("date_logged", start)
      .lte("date_logged", end);
    if (error) throw error;

    const counts = {};
    data.forEach((t) => (counts[t.date_logged] = (counts[t.date_logged] || 0) + 1));
    res.json({ start, end, days: Object.entries(counts).map(([date, count]) => ({ date, count })) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// ── POST /tasks ───────────────────────────────────────────────────────────────
// No workspace header = personal task. With a company: team/project/assignee.

export const addTask = async (req, res) => {
  const { fields, error: invalid } = readTaskFields(req.body, { requireTitle: true });
  if (invalid) return res.status(400).json({ error: invalid });

  // subtask: lives where its parent lives
  if (fields.parent_task_id) {
    const { data: parent } = await supabase.from("tasks").select("*").eq("id", fields.parent_task_id).maybeSingle();
    if (!(await taskAccess(parent, req.user.id)).canView) return res.status(400).json({ error: "Parent task not found" });
    if (parent.parent_task_id) return res.status(400).json({ error: "Subtasks can't have their own subtasks" });
    if ((parent.company_id || null) !== (req.company?.id || null))
      return res.status(400).json({ error: "Switch to the parent task's workspace first" });
    fields.team_id = parent.team_id;
    fields.project_id = parent.project_id;
  }

  if (req.company) {
    const member = req.company.member;
    if (!can(member, "task.create")) return res.status(403).json({ error: "Viewers can't add tasks" });
    if (fields.assignee_id && fields.assignee_id !== req.user.id && member.role === "guest")
      return res.status(403).json({ error: "Guests can't assign tasks to others" });
    const problem = await checkPlacement(fields, member);
    if (problem) return res.status(400).json({ error: problem });
    fields.company_id = req.company.id;
    fields.assignee_id = fields.assignee_id || req.user.id;
  } else {
    if (fields.project_id || fields.team_id)
      return res.status(400).json({ error: "Projects and teams belong to a company — switch to that company first" });
    if (fields.assignee_id && fields.assignee_id !== req.user.id)
      return res.status(400).json({ error: "Personal tasks can't be assigned to others" });
    if (fields.reviewer_id || fields.status_id || fields.sprint_id)
      return res.status(400).json({ error: "Reviewers, columns and sprints are for company tasks" });
    delete fields.assignee_id;
  }

  try {
    const { data, error } = await supabase
      .from("tasks")
      .insert([{
        status: "Doing",
        ...fields,
        user_id: req.user.id,
        date_logged: fields.date_logged || todayIn(req.user.timezone),
      }])
      .select("*")
      .single();
    if (error) throw error;

    // Attach tags
    const tagIds = await ownTagIds(req.user.id, req.body.tags);
    if (tagIds.length > 0) {
      await supabase
        .from("task_tags")
        .insert(tagIds.map((tagId) => ({ task_id: data.id, tag_id: tagId })));
    }

    res.status(201).json(await loadTask(data.id));
    announce(data, "created");
    if (data.company_id) notifyChanges(req.user.id, data).catch(() => {});
    syncTaskToGoogle(req.user.id, data).catch(() => {});
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// ── PUT /tasks/:id ────────────────────────────────────────────────────────────

export const updateTask = async (req, res) => {
  const { fields, error: invalid } = readTaskFields(req.body);
  if (invalid) return res.status(400).json({ error: invalid });

  const { data: existing } = await supabase.from("tasks").select("*").eq("id", req.params.id).maybeSingle();
  const access = await taskAccess(existing, req.user.id);
  if (!access.canView) return res.status(404).json({ error: "Task not found" });
  if (!access.canEdit) return res.status(403).json({ error: "You can't edit this task" });
  if (fields.parent_task_id !== undefined && fields.parent_task_id !== existing.parent_task_id)
    return res.status(400).json({ error: "A task can't move to another parent" });
  delete fields.parent_task_id;
  // subtasks stay on their parent's team and project
  if (existing.parent_task_id && (fields.project_id !== undefined || fields.team_id !== undefined)) {
    delete fields.project_id;
    delete fields.team_id;
  }

  if (existing.company_id) {
    if (fields.reviewer_id !== undefined && fields.reviewer_id !== existing.reviewer_id && !access.canAssign)
      return res.status(403).json({ error: "You can't change the reviewer" });
    if (fields.assignee_id !== undefined && fields.assignee_id !== existing.assignee_id) {
      if (!access.canAssign) return res.status(403).json({ error: "You can't reassign this task" });
      if (!fields.assignee_id) return res.status(400).json({ error: "A company task needs an assignee" });
    }
    const problem = await checkPlacement(fields, access.member, existing);
    if (problem) return res.status(400).json({ error: problem });
  } else if (fields.project_id || fields.team_id || fields.reviewer_id || fields.status_id || fields.sprint_id || (fields.assignee_id && fields.assignee_id !== req.user.id)) {
    return res.status(400).json({ error: "Personal tasks can't have a team, project, reviewer or other assignee" });
  }

  try {
    const { data, error } = await supabase
      .from("tasks")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .select("*")
      .single();
    if (error) throw error;

    // Replace tags if provided (tags are personal labels of whoever edits)
    if (Array.isArray(req.body.tags)) {
      await supabase.from("task_tags").delete().eq("task_id", data.id);
      const tagIds = await ownTagIds(req.user.id, req.body.tags);
      if (tagIds.length > 0) {
        await supabase
          .from("task_tags")
          .insert(tagIds.map((tagId) => ({ task_id: data.id, tag_id: tagId })));
      }
    }

    res.json(await loadTask(data.id));
    announce(data, "updated");
    syncTaskToGoogle(data.user_id, data).catch(() => {});
    if (data.company_id) notifyChanges(req.user.id, data, existing).catch(() => {});
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// ── PUT /tasks/reorder ────────────────────────────────────────────────────────
// Board drag & drop: { status, ids: [taskId, ...] } in their new order.
// Tasks you can't edit are skipped.

export const reorderTasks = async (req, res) => {
  const { status, ids } = req.body;
  if (!STATUSES.includes(status) || !Array.isArray(ids) || ids.length > 500)
    return res.status(400).json({ error: "status and ids are required" });

  try {
    const { data: rows } = await supabase.from("tasks").select("*").in("id", ids);
    const editable = new Set();
    for (const row of rows || []) if ((await taskAccess(row, req.user.id)).canEdit) editable.add(row.id);

    // project tasks also move to a matching board column
    const columns = {};
    for (const row of rows || [])
      if (editable.has(row.id) && row.project_id && !columns[row.project_id])
        columns[row.project_id] = await ensureStatuses(row.project_id);
    await Promise.all(
      ids.map((id, index) => {
        if (!editable.has(Number(id))) return null;
        const row = rows.find((r) => r.id === Number(id));
        const update = { status, position: index, updated_at: new Date().toISOString() };
        if (row.project_id) {
          const col = statusIdForLegacy(status, row.status_id, columns[row.project_id]);
          if (col !== undefined) update.status_id = col;
        }
        return supabase.from("tasks").update(update).eq("id", id);
      })
    );
    res.json({ success: true, updated: editable.size });
    (rows || []).filter((r) => editable.has(r.id)).slice(0, 1).forEach((r) => announce(r, "updated"));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// ── DELETE /tasks/:id ─────────────────────────────────────────────────────────

export const deleteTask = async (req, res) => {
  try {
    const { data: task } = await supabase.from("tasks").select("*").eq("id", req.params.id).maybeSingle();
    const access = await taskAccess(task, req.user.id);
    if (!access.canView) return res.status(404).json({ error: "Task not found" });
    if (!access.canDelete) return res.status(403).json({ error: "Only its creator or a lead can delete this task" });

    const { error } = await supabase.from("tasks").delete().eq("id", req.params.id);
    if (error) throw error;
    res.json({ success: true });
    announce(task, "deleted");
    if (task.google_event_id) syncTaskToGoogle(task.user_id, task, { deleted: true }).catch(() => {});
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// ── Cron job: recurring tasks (called every hour from server.js) ──────────────
//
// A task with `recurrence` set is the original. Each day it's due (in the
// owner's timezone) we add a copy as a "Doing" task. The unique index on
// (recurrence_parent_id, date_logged) means a day can never get two copies.

const weekdayOf = (dateStr) => new Date(dayNumber(dateStr) * 86400000).getUTCDay(); // 0 = Sun
const lastDayOfMonth = (dateStr) => monthRange(dateStr.slice(0, 7)).end.slice(8, 10);

export const recursOn = (rule, startDate, today) => {
  if (today <= startDate) return false; // the original covers its own day
  if (rule === "daily") return true;
  if (rule === "weekdays") return ![0, 6].includes(weekdayOf(today));
  if (rule === "weekly") return weekdayOf(today) === weekdayOf(startDate);
  if (rule === "monthly") {
    const wanted = startDate.slice(8, 10);
    const day = today.slice(8, 10);
    // 31st in a 30-day month -> use the last day
    return day === wanted || (day === lastDayOfMonth(today) && wanted > day);
  }
  return false;
};

export const runRecurringJob = async () => {
  const { data: originals, error } = await supabase
    .from("tasks")
    .select("id, user_id, company_id, team_id, project_id, assignee_id, title, description, priority, recurrence, date_logged, task_tags(tag_id), creator:users!user_id(timezone)")
    .not("recurrence", "is", null)
    .is("recurrence_parent_id", null);
  if (error) return console.error("[Cron] recurring:", error.message);

  let created = 0;
  for (const t of originals) {
    const today = todayIn(t.creator?.timezone);
    if (!recursOn(t.recurrence, t.date_logged, today)) continue;

    const { data: copy, error: insertError } = await supabase
      .from("tasks")
      .insert([{
        user_id: t.user_id,
        company_id: t.company_id,
        team_id: t.team_id,
        project_id: t.project_id,
        assignee_id: t.assignee_id,
        title: t.title,
        description: t.description,
        priority: t.priority,
        status: "Doing",
        date_logged: today,
        due_date: today,
        recurrence_parent_id: t.id,
      }])
      .select("*")
      .single();
    if (insertError) continue; // already made today

    const tagIds = (t.task_tags || []).map((tt) => tt.tag_id);
    if (tagIds.length)
      await supabase.from("task_tags").insert(tagIds.map((tag_id) => ({ task_id: copy.id, tag_id })));
    announce(copy, "created");
    syncTaskToGoogle(t.user_id, copy).catch(() => {});
    created++;
  }
  if (created) console.log(`[Cron] recurring: created ${created} task(s)`);
};
