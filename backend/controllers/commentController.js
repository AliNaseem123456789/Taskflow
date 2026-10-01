import { supabase } from "../config/supabase.js";
import { notify } from "./notificationController.js";
import { sendTo } from "../utils/events.js";
import { taskAccess } from "../utils/permissions.js";

// Mentions are written as @[Name](user-id) by the comment box
const MENTION_RE = /@\[([^\]]{1,80})\]\(([0-9a-f-]{36})\)/g;
const mentionedIds = (text) => [...new Set([...text.matchAll(MENTION_RE)].map((m) => m[2]))];
const plainText = (text) => text.replace(MENTION_RE, "@$1");

// Everyone who can see a task (for @mentions and comment notifications).
// Personal task: just its creator. Company task: people whose role reaches it.
export async function peopleWhoCanSee(taskId) {
  const { data: task } = await supabase
    .from("tasks").select("id, user_id, assignee_id, company_id, team_id, project_id").eq("id", taskId).maybeSingle();
  if (!task) return [];

  let userIds = [task.user_id];
  if (task.company_id) {
    const { data: members } = await supabase
      .from("company_members").select("user_id, role, department_id")
      .eq("company_id", task.company_id).eq("status", "active");
    const { data: team } = task.team_id
      ? await supabase.from("teams").select("department_id").eq("id", task.team_id).maybeSingle()
      : { data: null };
    const [{ data: teamPeople }, { data: projectPeople }, { data: project }] = await Promise.all([
      task.team_id ? supabase.from("team_members").select("user_id").eq("team_id", task.team_id) : { data: [] },
      task.project_id ? supabase.from("project_members").select("user_id").eq("project_id", task.project_id) : { data: [] },
      task.project_id ? supabase.from("projects").select("visibility").eq("id", task.project_id).maybeSingle() : { data: null },
    ]);
    const onTeam = new Set((teamPeople || []).map((m) => m.user_id));
    const onProject = new Set((projectPeople || []).map((m) => m.user_id));
    const openProject = project?.visibility === "company";

    userIds = (members || [])
      .filter((m) =>
        ["owner", "admin", "viewer"].includes(m.role) ||
        m.user_id === task.user_id || m.user_id === task.assignee_id ||
        onTeam.has(m.user_id) || onProject.has(m.user_id) ||
        (m.role === "manager" && (!m.department_id || m.department_id === team?.department_id)) ||
        (openProject && ["member", "manager"].includes(m.role))
      )
      .map((m) => m.user_id);
  } else if (task.assignee_id) {
    userIds.push(task.assignee_id);
  }

  const { data: users } = await supabase.from("users").select("id, name, email").in("id", [...new Set(userIds)]);
  return (users || []).map((u) => ({ ...u, is_owner: u.id === (task.assignee_id || task.user_id) }));
}

// Kept for older callers: can this user see the task?
export async function canAccessTask(taskId, userId) {
  const { data: task } = await supabase.from("tasks").select("*").eq("id", taskId).maybeSingle();
  return (await taskAccess(task, userId)).canView;
}

const accessFor = async (taskId, userId) => {
  const { data: task } = await supabase.from("tasks").select("*").eq("id", taskId).maybeSingle();
  return taskAccess(task, userId);
};

export const getComments = async (req, res) => {
  const { taskId } = req.params;
  if (!(await canAccessTask(taskId, req.user.id)))
    return res.status(404).json({ error: "Task not found" });

  const { data, error } = await supabase
    .from("task_comments")
    .select("*, users(id, name, email)")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map((c) => ({ ...c, user: c.users, users: undefined })));
};

export const addComment = async (req, res) => {
  const { taskId } = req.params;
  const { content } = req.body;
  if (!content?.trim()) return res.status(400).json({ error: "Content required" });
  const access = await accessFor(taskId, req.user.id);
  if (!access.canView) return res.status(404).json({ error: "Task not found" });
  if (!access.canComment) return res.status(403).json({ error: "Viewers can't comment" });

  const { data, error } = await supabase
    .from("task_comments")
    .insert([{ task_id: taskId, user_id: req.user.id, content: content.trim() }])
    .select("*, users(id, name, email)")
    .single();
  if (error) return res.status(500).json({ error: error.message });

  // Notify @mentioned people (only if they can see the task) and the owner
  try {
    const people = await peopleWhoCanSee(taskId);
    const canSee = new Set(people.map((p) => p.id));
    const owner = people.find((p) => p.is_owner);
    const author = data.users?.name || data.users?.email || "Someone";
    const snippet = plainText(content.trim()).slice(0, 100);
    const link = `/tasks/${taskId}`;

    const mentioned = mentionedIds(content).filter((id) => canSee.has(id));
    const items = mentioned.map((id) => ({
      user_id: id, type: "mention", task_id: Number(taskId), link,
      message: `${author} mentioned you: "${snippet}"`,
    }));
    if (owner && !mentioned.includes(owner.id))
      items.push({
        user_id: owner.id, type: "comment", task_id: Number(taskId), link,
        message: `${author} commented on your task: "${snippet}"`,
      });
    await notify(req.user.id, items);
    sendTo([...canSee], "comment", { task_id: Number(taskId) });
  } catch (e) {
    console.error("comment notifications failed:", e.message);
  }

  res.status(201).json({ ...data, user: data.users, users: undefined });
};

export const deleteComment = async (req, res) => {
  const { commentId } = req.params;
  const { error } = await supabase
    .from("task_comments")
    .delete()
    .eq("id", commentId)
    .eq("user_id", req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
};

export const toggleReaction = async (req, res) => {
  const { taskId } = req.params;
  const access = await accessFor(taskId, req.user.id);
  if (!access.canView) return res.status(404).json({ error: "Task not found" });
  if (!access.canComment) return res.status(403).json({ error: "Viewers can't react" });

  const { data: existing } = await supabase
    .from("task_reactions")
    .select("id")
    .eq("task_id", taskId)
    .eq("user_id", req.user.id)
    .maybeSingle();

  if (existing) {
    await supabase.from("task_reactions").delete().eq("id", existing.id);
    return res.json({ liked: false });
  }

  await supabase
    .from("task_reactions")
    .insert([{ task_id: taskId, user_id: req.user.id, emoji: "👍" }]);
  res.json({ liked: true });
};

// GET /tasks/:taskId/mentionable -> people you can @mention on this task
export const getMentionable = async (req, res) => {
  const { taskId } = req.params;
  if (!(await canAccessTask(taskId, req.user.id)))
    return res.status(404).json({ error: "Task not found" });
  const people = await peopleWhoCanSee(taskId);
  res.json(people.filter((p) => p.id !== req.user.id));
};
