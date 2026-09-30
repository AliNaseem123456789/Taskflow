import { supabase } from "../config/supabase.js";
import { todayIn, dayNumber, monthRange } from "../utils/time.js";

// Full select with tags + reactions
const TASK_SELECT = "*, task_tags(tags(id, name, color)), task_reactions(user_id, emoji)";

const normaliseTasks = (data) =>
  data.map((t) => ({
    ...t,
    tags: t.task_tags?.map((tt) => tt.tags).filter(Boolean) || [],
    reactions: t.task_reactions || [],
    task_tags: undefined,
    task_reactions: undefined,
  }));

// ── GET /tasks 

export const getTasks = async (req, res) => {
  const { date, month, start, end } = req.query;
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

    const { data, error } = await query.order("date_logged", { ascending: true });
    if (error) throw error;
    res.json(normaliseTasks(data));
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// ── GET /tasks/search?q= 

export const searchTasks = async (req, res) => {
  const { q } = req.query;
  if (!q?.trim()) return res.json([]);
  try {
    const { data, error } = await supabase
      .from("tasks")
      .select(TASK_SELECT)
      .eq("user_id", req.user.id)
      .ilike("title", `%${q.trim()}%`)
      .order("date_logged", { ascending: false })
      .limit(50);
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

// ── POST /tasks ───────────────────────────────────────────────────────────────

export const addTask = async (req, res) => {
  const { title, description, status = "Doing", date_logged, tags = [] } = req.body;
  try {
    const { data, error } = await supabase
      .from("tasks")
      .insert([{
        user_id: req.user.id,
        title,
        description,
        status,
        date_logged: date_logged || todayIn(req.user.timezone),
      }])
      .select("*")
      .single();
    if (error) throw error;

    // Attach tags
    if (tags.length > 0) {
      await supabase
        .from("task_tags")
        .insert(tags.map((tagId) => ({ task_id: data.id, tag_id: tagId })));
    }

    const { data: full } = await supabase
      .from("tasks")
      .select(TASK_SELECT)
      .eq("id", data.id)
      .single();
    res.status(201).json(normaliseTasks([full])[0]);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// ── PUT /tasks/:id ────────────────────────────────────────────────────────────

export const updateTask = async (req, res) => {
  const { status, title, description, tags } = req.body;
  try {
    const { data, error } = await supabase
      .from("tasks")
      .update({ status, title, description, updated_at: new Date().toISOString() })
      .eq("id", req.params.id)
      .eq("user_id", req.user.id)
      .select("*")
      .single();
    if (error) throw error;

    // Replace tags if provided
    if (Array.isArray(tags)) {
      await supabase.from("task_tags").delete().eq("task_id", data.id);
      if (tags.length > 0) {
        await supabase
          .from("task_tags")
          .insert(tags.map((tagId) => ({ task_id: data.id, tag_id: tagId })));
      }
    }

    const { data: full } = await supabase
      .from("tasks")
      .select(TASK_SELECT)
      .eq("id", data.id)
      .single();
    res.json(normaliseTasks([full])[0]);
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
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};