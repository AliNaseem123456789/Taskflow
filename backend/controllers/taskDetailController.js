// controllers/taskDetailController.js
// The parts inside one task: subtasks, checklist, "blocked by" links, watchers.
// Plus the cross-company "my work" inbox.
import { supabase } from "../config/supabase.js";
import { taskAccess } from "../utils/permissions.js";
import { ensureStatuses } from "../utils/projectStatuses.js";

const LINK_FIELDS = "id, title, status, assignee_id, company_id, due_date";

// Load a task and my access to it, or answer 404/403. Returns null when it answered.
const withAccess = async (req, res, need = "canView") => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    res.status(404).json({ error: "Task not found" });
    return null;
  }
  const { data: task } = await supabase.from("tasks").select("*").eq("id", id).maybeSingle();
  const access = await taskAccess(task, req.user.id);
  if (!access.canView) {
    res.status(404).json({ error: "Task not found" });
    return null;
  }
  if (!access[need]) {
    res.status(403).json({ error: "You can't change this task" });
    return null;
  }
  return { task, access };
};

// Everything the task page shows besides the task row itself.
// Linked tasks I can't see are left out (or counted, for blockers).
export const taskExtras = async (task, userId) => {
  const [{ data: subtasks }, { data: checklist }, { data: blockedBy }, { data: blocking }, { data: watchers }] =
    await Promise.all([
      supabase.from("tasks").select(`${LINK_FIELDS}, user_id, team_id, project_id, reviewer_id, assignee:users!assignee_id(id, name, email)`)
        .eq("parent_task_id", task.id).order("id"),
      supabase.from("task_checklist_items").select("id, title, done, position").eq("task_id", task.id).order("position").order("created_at"),
      supabase.from("task_dependencies").select(`blocked_by_id, blocker:tasks!blocked_by_id(${LINK_FIELDS}, user_id, team_id, project_id, reviewer_id)`)
        .eq("task_id", task.id),
      supabase.from("task_dependencies").select(`task_id, blocked:tasks!task_id(${LINK_FIELDS}, user_id, team_id, project_id, reviewer_id)`)
        .eq("blocked_by_id", task.id),
      supabase.from("task_watchers").select("user_id, users!user_id(id, name, email)").eq("task_id", task.id),
    ]);

  const visible = async (rows) => {
    const out = [];
    for (const row of rows) if (row && (await taskAccess(row, userId)).canView) out.push(row);
    return out;
  };
  const strip = ({ id, title, status, assignee_id, due_date, assignee }) => ({ id, title, status, assignee_id, due_date, assignee });

  const blockers = (blockedBy || []).map((d) => d.blocker).filter(Boolean);
  const shownBlockers = await visible(blockers);
  const parent = task.parent_task_id
    ? (await supabase.from("tasks").select(`${LINK_FIELDS}, user_id, team_id, project_id, reviewer_id`).eq("id", task.parent_task_id).maybeSingle()).data
    : null;

  return {
    subtasks: (await visible(subtasks || [])).map(strip),
    checklist: checklist || [],
    blocked_by: shownBlockers.map(strip),
    // a blocker you can't see still blocks: say how many are open
    hidden_open_blockers: blockers.filter((b) => b.status !== "Done" && !shownBlockers.includes(b)).length,
    blocking: (await visible((blocking || []).map((d) => d.blocked).filter(Boolean))).map(strip),
    watchers: (watchers || []).map((w) => w.users).filter(Boolean),
    watching: (watchers || []).some((w) => w.user_id === userId),
    parent: parent && (await taskAccess(parent, userId)).canView ? strip(parent) : null,
    project_statuses: task.project_id ? await ensureStatuses(task.project_id) : [],
  };
};

// ── Checklist ────────────────────────────────────────────────────────────────

// POST /tasks/:id/checklist { title }
export const addChecklistItem = async (req, res) => {
  const ctx = await withAccess(req, res, "canEdit");
  if (!ctx) return;
  const title = String(req.body.title || "").trim().slice(0, 300);
  if (!title) return res.status(400).json({ error: "Write the item first" });
  const { count } = await supabase.from("task_checklist_items").select("id", { count: "exact", head: true }).eq("task_id", ctx.task.id);
  if (count >= 100) return res.status(400).json({ error: "At most 100 items per checklist" });
  const { data, error } = await supabase
    .from("task_checklist_items").insert([{ task_id: ctx.task.id, title, position: count || 0 }])
    .select("id, title, done, position").single();
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json(data);
};

// PUT /tasks/:id/checklist/:itemId { title?, done? }
export const updateChecklistItem = async (req, res) => {
  const ctx = await withAccess(req, res, "canEdit");
  if (!ctx) return;
  const updates = {};
  if (req.body.title !== undefined) {
    const title = String(req.body.title || "").trim().slice(0, 300);
    if (!title) return res.status(400).json({ error: "An item needs some text" });
    updates.title = title;
  }
  if (req.body.done !== undefined) {
    updates.done = !!req.body.done;
    updates.done_by = req.body.done ? req.user.id : null;
  }
  if (!Object.keys(updates).length) return res.status(400).json({ error: "Nothing to update" });
  const { data, error } = await supabase
    .from("task_checklist_items").update(updates).eq("id", req.params.itemId).eq("task_id", ctx.task.id)
    .select("id, title, done, position").maybeSingle();
  if (error || !data) return res.status(404).json({ error: "Item not found" });
  res.json(data);
};

// DELETE /tasks/:id/checklist/:itemId
export const deleteChecklistItem = async (req, res) => {
  const ctx = await withAccess(req, res, "canEdit");
  if (!ctx) return;
  await supabase.from("task_checklist_items").delete().eq("id", req.params.itemId).eq("task_id", ctx.task.id);
  res.json({ success: true });
};

// ── Blocked by ───────────────────────────────────────────────────────────────

// Would "task waits for blocker" make a loop? Walk what the blocker waits for.
const makesLoop = async (taskId, blockerId) => {
  const seen = new Set();
  let frontier = [blockerId];
  while (frontier.length && seen.size < 2000) {
    if (frontier.includes(taskId)) return true;
    frontier.forEach((id) => seen.add(id));
    const { data } = await supabase.from("task_dependencies").select("blocked_by_id").in("task_id", frontier);
    frontier = [...new Set((data || []).map((d) => d.blocked_by_id))].filter((id) => !seen.has(id));
  }
  return false;
};

// POST /tasks/:id/dependencies { blocked_by_id }
export const addDependency = async (req, res) => {
  const ctx = await withAccess(req, res, "canEdit");
  if (!ctx) return;
  const blockerId = Number(req.body.blocked_by_id);
  if (!Number.isInteger(blockerId)) return res.status(400).json({ error: "Pick a task" });
  if (blockerId === ctx.task.id) return res.status(400).json({ error: "A task can't wait for itself" });
  const { data: blocker } = await supabase.from("tasks").select("*").eq("id", blockerId).maybeSingle();
  if (!(await taskAccess(blocker, req.user.id)).canView) return res.status(400).json({ error: "Task not found" });
  if ((blocker.company_id || null) !== (ctx.task.company_id || null))
    return res.status(400).json({ error: "Both tasks must be in the same workspace" });
  if (await makesLoop(ctx.task.id, blockerId))
    return res.status(400).json({ error: "That would make a loop: the other task already waits for this one" });

  const { error } = await supabase.from("task_dependencies")
    .insert([{ task_id: ctx.task.id, blocked_by_id: blockerId, created_by: req.user.id }]);
  if (error?.code === "23505") return res.status(400).json({ error: "Already linked" });
  if (error) return res.status(500).json({ error: error.message });
  res.status(201).json({ success: true });
};

// DELETE /tasks/:id/dependencies/:blockerId
export const removeDependency = async (req, res) => {
  const ctx = await withAccess(req, res, "canEdit");
  if (!ctx) return;
  await supabase.from("task_dependencies").delete().eq("task_id", ctx.task.id).eq("blocked_by_id", req.params.blockerId);
  res.json({ success: true });
};

// ── Watchers ─────────────────────────────────────────────────────────────────

// POST /tasks/:id/watchers { user_id? } — yourself by default; others need edit rights
export const addWatcher = async (req, res) => {
  const ctx = await withAccess(req, res);
  if (!ctx) return;
  const userId = req.body?.user_id || req.user.id;
  if (userId !== req.user.id) {
    if (!ctx.access.canEdit) return res.status(403).json({ error: "You can only watch it yourself" });
    const { data: who } = await supabase.from("users").select("id").eq("id", userId).maybeSingle();
    if (!who || !(await taskAccess(ctx.task, userId)).canView)
      return res.status(400).json({ error: "That person can't see this task" });
  }
  await supabase.from("task_watchers").upsert([{ task_id: ctx.task.id, user_id: userId }], { onConflict: "task_id,user_id" });
  res.status(201).json({ success: true });
};

// DELETE /tasks/:id/watchers/:userId — yourself, or anyone if you can edit
export const removeWatcher = async (req, res) => {
  const ctx = await withAccess(req, res);
  if (!ctx) return;
  if (req.params.userId !== req.user.id && !ctx.access.canEdit)
    return res.status(403).json({ error: "You can only stop watching yourself" });
  await supabase.from("task_watchers").delete().eq("task_id", ctx.task.id).eq("user_id", req.params.userId);
  res.json({ success: true });
};

// ── GET /tasks/inbox — my open work in every company + personal ──────────────
// { assigned: [...], reviewing: [...], watching: [...] }, each task with company {id, name}
export const getInbox = async (req, res) => {
  const me = req.user.id;
  const [{ data: memberships }, { data: watched }] = await Promise.all([
    supabase.from("company_members").select("company_id, companies(id, name)").eq("user_id", me).eq("status", "active"),
    supabase.from("task_watchers").select("task_id").eq("user_id", me),
  ]);
  const companies = Object.fromEntries((memberships || []).map((m) => [m.company_id, m.companies]));
  const watchedIds = (watched || []).map((w) => w.task_id);

  const parts = [`assignee_id.eq.${me}`, `reviewer_id.eq.${me}`];
  if (watchedIds.length) parts.push(`id.in.(${watchedIds.join(",")})`);
  const { data, error } = await supabase
    .from("tasks")
    .select("id, title, status, priority, due_date, date_logged, user_id, assignee_id, reviewer_id, company_id, team_id, project_id, parent_task_id, projects(id, name, color), assignee:users!assignee_id(id, name, email)")
    .or(parts.join(","))
    .neq("status", "Done")
    .order("due_date", { ascending: true, nullsFirst: false })
    .limit(500);
  if (error) return res.status(500).json({ error: error.message });

  // personal tasks + companies I'm still in; watched tasks only if I can still see them
  const rows = [];
  for (const t of data) {
    if (t.company_id && !companies[t.company_id]) continue;
    if (t.assignee_id !== me && t.reviewer_id !== me && !(await taskAccess(t, me)).canView) continue;
    rows.push({ ...t, project: t.projects || null, projects: undefined, company: t.company_id ? companies[t.company_id] : null });
  }
  res.json({
    assigned: rows.filter((t) => t.assignee_id === me && (t.company_id || t.user_id === me)),
    reviewing: rows.filter((t) => t.reviewer_id === me),
    watching: rows.filter((t) => watchedIds.includes(t.id) && t.assignee_id !== me && t.reviewer_id !== me),
  });
};
