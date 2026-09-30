import { supabase } from "../config/supabase.js";
import { todayIn, dayNumber, monthRange, addDays } from "../utils/time.js";
import { canAccessTask } from "./commentController.js";
import { publishToTeammates } from "../utils/events.js";
import { canUseProject } from "./projectController.js";

// tell the owner's teammates (and the owner's other tabs) something changed
const announce = (userId, action, taskId) =>
  publishToTeammates(userId, "task", { action, id: taskId });

// Full select with tags + reactions
const TASK_SELECT =
  "*, projects(id, name, color), task_tags(tags(id, name, color)), task_reactions(user_id, emoji)";

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

// Picks the task fields a client may set and checks them.
// Returns { fields } or { error }.
const readTaskFields = (body, { requireTitle = false } = {}) => {
  const fields = {};

  if (body.title !== undefined || requireTitle) {
    const title = String(body.title || "").trim();
    if (!title) return { error: "Title is required" };
    fields.title = title;
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
  if (body.project_id !== undefined) fields.project_id = body.project_id || null;
  if (body.blocker !== undefined) {
    const b = String(body.blocker || "").trim();
    fields.blocker = b || null;
  }
  return { fields };
};

// Only tag ids that belong to this user
const ownTagIds = async (userId, tagIds) => {
  if (!Array.isArray(tagIds) || !tagIds.length) return [];
  const { data } = await supabase.from("tags").select("id").eq("user_id", userId).in("id", tagIds);
  return (data || []).map((t) => t.id);
};

const loadTask = async (id) => {
  const { data } = await supabase.from("tasks").select(TASK_SELECT).eq("id", id).single();
  return data ? normaliseTasks([data])[0] : null;
};

// ── GET /tasks ────────────────────────────────────────────────────────────────
// ?date=YYYY-MM-DD | ?month=YYYY-MM | ?start=&end= | ?open=1 (not Done, any date)

export const getTasks = async (req, res) => {
  const { date, month, start, end, open } = req.query;
  try {
    let query = supabase
      .from("tasks")
      .select(TASK_SELECT)
      .eq("user_id", req.user.id);

    if (date) {
      query = query.eq("date_logged", date);
    } else if (month) {
      const range = monthRange(month);
      query = query.gte("date_logged", range.start).lte("date_logged", range.end);
    } else if (start && end) {
      query = query.gte("date_logged", start).lte("date_logged", end);
    }
    if (open) query = query.neq("status", "Done");

    const { data, error } = await query.order("date_logged", { ascending: true });
    if (error) throw error;
    res.json(normaliseTasks(data));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// ── GET /tasks/:id ────────────────────────────────────────────────────────────
// Owner or teammates (used by notification links)

export const getTask = async (req, res) => {
  try {
    if (!(await canAccessTask(req.params.id, req.user.id)))
      return res.status(404).json({ error: "Task not found" });
    const { data, error } = await supabase
      .from("tasks")
      .select(`${TASK_SELECT}, users(id, name, email)`)
      .eq("id", req.params.id)
      .single();
    if (error) throw error;
    const [task] = normaliseTasks([data]);
    res.json({ ...task, owner: data.users, users: undefined });
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
    let query = supabase.from("tasks").select(TASK_SELECT).eq("user_id", req.user.id);

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

export const getStreak = async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("tasks")
      .select("date_logged")
      .eq("user_id", req.user.id)
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
// Done tasks per day, for the GitHub-style activity grid

export const getHeatmap = async (req, res) => {
  const days = Math.min(Math.max(Number(req.query.days) || 365, 7), 730);
  const end = todayIn(req.user.timezone);
  const start = addDays(end, -(days - 1));
  try {
    const { data, error } = await supabase
      .from("tasks")
      .select("date_logged")
      .eq("user_id", req.user.id)
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

export const addTask = async (req, res) => {
  const { fields, error: invalid } = readTaskFields(req.body, { requireTitle: true });
  if (invalid) return res.status(400).json({ error: invalid });
  if (fields.project_id && !(await canUseProject(req.user.id, fields.project_id)))
    return res.status(400).json({ error: "You're not in that project's team" });

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
    announce(req.user.id, "created", data.id);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// ── PUT /tasks/:id ────────────────────────────────────────────────────────────

export const updateTask = async (req, res) => {
  const { fields, error: invalid } = readTaskFields(req.body);
  if (invalid) return res.status(400).json({ error: invalid });
  if (fields.project_id && !(await canUseProject(req.user.id, fields.project_id)))
    return res.status(400).json({ error: "You're not in that project's team" });

  try {
    const { data, error } = await supabase
      .from("tasks")
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .eq("user_id", req.user.id)
      .select("*")
      .single();
    if (error) throw error;

    // Replace tags if provided
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
    announce(req.user.id, "updated", data.id);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// ── PUT /tasks/reorder ────────────────────────────────────────────────────────
// Board drag & drop: { status, ids: [taskId, ...] } in their new order

export const reorderTasks = async (req, res) => {
  const { status, ids } = req.body;
  if (!STATUSES.includes(status) || !Array.isArray(ids))
    return res.status(400).json({ error: "status and ids are required" });

  try {
    await Promise.all(
      ids.map((id, index) =>
        supabase
          .from("tasks")
          .update({ status, position: index, updated_at: new Date().toISOString() })
          .eq("id", id)
          .eq("user_id", req.user.id)
      )
    );
    res.json({ success: true });
    announce(req.user.id, "updated", null);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// ── DELETE /tasks/:id ─────────────────────────────────────────────────────────

export const deleteTask = async (req, res) => {
  try {
    const { error } = await supabase
      .from("tasks")
      .delete()
      .eq("id", req.params.id)
      .eq("user_id", req.user.id);
    if (error) throw error;
    res.json({ success: true });
    announce(req.user.id, "deleted", Number(req.params.id));
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
    .select("id, user_id, title, description, priority, recurrence, date_logged, task_tags(tag_id), users(timezone)")
    .not("recurrence", "is", null)
    .is("recurrence_parent_id", null);
  if (error) return console.error("[Cron] recurring:", error.message);

  let created = 0;
  for (const t of originals) {
    const today = todayIn(t.users?.timezone);
    if (!recursOn(t.recurrence, t.date_logged, today)) continue;

    const { data: copy, error: insertError } = await supabase
      .from("tasks")
      .insert([{
        user_id: t.user_id,
        title: t.title,
        description: t.description,
        priority: t.priority,
        status: "Doing",
        date_logged: today,
        due_date: today,
        recurrence_parent_id: t.id,
      }])
      .select("id")
      .single();
    if (insertError) continue; // already made today

    const tagIds = (t.task_tags || []).map((tt) => tt.tag_id);
    if (tagIds.length)
      await supabase.from("task_tags").insert(tagIds.map((tag_id) => ({ task_id: copy.id, tag_id })));
    announce(t.user_id, "created", copy.id);
    created++;
  }
  if (created) console.log(`[Cron] recurring: created ${created} task(s)`);
};
