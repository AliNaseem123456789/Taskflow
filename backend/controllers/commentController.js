import { supabase } from "../config/supabase.js";
import { notify } from "./notificationController.js";
import { sendTo } from "../utils/events.js";

// Mentions are written as @[Name](user-id) by the comment box
const MENTION_RE = /@\[([^\]]{1,80})\]\(([0-9a-f-]{36})\)/g;
const mentionedIds = (text) => [...new Set([...text.matchAll(MENTION_RE)].map((m) => m[2]))];
const plainText = (text) => text.replace(MENTION_RE, "@$1");

// Everyone who can see a task: its owner + members of the owner's teams
export async function peopleWhoCanSee(taskId) {
  const { data: task } = await supabase.from("tasks").select("user_id").eq("id", taskId).maybeSingle();
  if (!task) return [];
  const { data: ownerTeams } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", task.user_id);
  const teamIds = (ownerTeams || []).map((t) => t.team_id);

  let userIds = [task.user_id];
  if (teamIds.length) {
    const { data: members } = await supabase.from("team_members").select("user_id").in("team_id", teamIds);
    userIds = [...new Set([...userIds, ...(members || []).map((m) => m.user_id)])];
  }
  const { data: users } = await supabase.from("users").select("id, name, email").in("id", userIds);
  return (users || []).map((u) => ({ ...u, is_owner: u.id === task.user_id }));
}

// A user can see a task if they own it, or share a team with its owner.
export async function canAccessTask(taskId, userId) {
  const { data: task } = await supabase
    .from("tasks")
    .select("user_id")
    .eq("id", taskId)
    .maybeSingle();
  if (!task) return false;
  if (task.user_id === userId) return true;

  const { data: myTeams } = await supabase
    .from("team_members")
    .select("team_id")
    .eq("user_id", userId);
  const teamIds = (myTeams || []).map((m) => m.team_id);
  if (!teamIds.length) return false;

  const { data: shared } = await supabase
    .from("team_members")
    .select("id")
    .eq("user_id", task.user_id)
    .in("team_id", teamIds)
    .limit(1);
  return shared?.length > 0;
}

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
  if (!(await canAccessTask(taskId, req.user.id)))
    return res.status(404).json({ error: "Task not found" });

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
  if (!(await canAccessTask(taskId, req.user.id)))
    return res.status(404).json({ error: "Task not found" });

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
