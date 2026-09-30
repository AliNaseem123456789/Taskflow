import { supabase } from "../config/supabase.js";
import { todayIn, monthRange, addDays, dayNumber } from "../utils/time.js";

// Date range of the current week (Mon-Sun) or month, in the user's timezone
export const periodRange = (period, tz) => {
  const today = todayIn(tz);
  if (period === "month") return monthRange(today.slice(0, 7));
  const weekday = (new Date(dayNumber(today) * 86400000).getUTCDay() + 6) % 7; // Mon = 0
  const start = addDays(today, -weekday);
  return { start, end: addDays(start, 6) };
};

// Adds { progress, start, end } to each goal: Done tasks in the period
// (only tasks with the goal's tag, if it has one). userIds = whose tasks count.
export const withProgress = async (goals, userIds, tz) => {
  const out = [];
  for (const g of goals) {
    const range = periodRange(g.period, tz);
    const { data: tasks } = await supabase
      .from("tasks")
      .select("id, project_id, task_tags(tag_id)")
      .in("user_id", userIds)
      .eq("status", "Done")
      .gte("date_logged", range.start)
      .lte("date_logged", range.end);
    const counted = (tasks || []).filter(
      (t) =>
        (!g.tag_id || t.task_tags?.some((tt) => tt.tag_id === g.tag_id)) &&
        (!g.project_id || t.project_id === g.project_id)
    );
    out.push({ ...g, progress: counted.length, ...range });
  }
  return out;
};

const readGoal = (body) => {
  const title = String(body.title || "").trim();
  const target = Number(body.target);
  if (!title) return { error: "Title is required" };
  if (!["week", "month"].includes(body.period)) return { error: "Period must be week or month" };
  if (!Number.isInteger(target) || target < 1 || target > 10000)
    return { error: "Target must be a whole number above 0" };
  return { fields: { title, target, period: body.period, tag_id: body.tag_id || null } };
};

// GET /goals
export const getGoals = async (req, res) => {
  const { data, error } = await supabase
    .from("goals")
    .select("*, tags(id, name, color)")
    .eq("user_id", req.user.id)
    .is("team_id", null)
    .order("created_at");
  if (error) return res.status(500).json({ error: error.message });
  res.json(await withProgress(data, [req.user.id], req.user.timezone));
};

// POST /goals
export const createGoal = async (req, res) => {
  const { fields, error: invalid } = readGoal(req.body);
  if (invalid) return res.status(400).json({ error: invalid });
  const { data, error } = await supabase
    .from("goals")
    .insert([{ ...fields, user_id: req.user.id }])
    .select("*, tags(id, name, color)")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  const [goal] = await withProgress([data], [req.user.id], req.user.timezone);
  res.status(201).json(goal);
};

// PUT /goals/:id
export const updateGoal = async (req, res) => {
  const { fields, error: invalid } = readGoal(req.body);
  if (invalid) return res.status(400).json({ error: invalid });
  const { data, error } = await supabase
    .from("goals")
    .update(fields)
    .eq("id", req.params.id)
    .eq("user_id", req.user.id)
    .is("team_id", null)
    .select("*, tags(id, name, color)")
    .single();
  if (error) return res.status(404).json({ error: "Goal not found" });
  const [goal] = await withProgress([data], [req.user.id], req.user.timezone);
  res.json(goal);
};

// DELETE /goals/:id
export const deleteGoal = async (req, res) => {
  const { error } = await supabase
    .from("goals")
    .delete()
    .eq("id", req.params.id)
    .eq("user_id", req.user.id)
    .is("team_id", null);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
};
