import { supabase } from "../config/supabase.js";

export const getComments = async (req, res) => {
  const { taskId } = req.params;
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

  const { data, error } = await supabase
    .from("task_comments")
    .insert([{ task_id: taskId, user_id: req.user.id, content: content.trim() }])
    .select("*, users(id, name, email)")
    .single();
  if (error) return res.status(500).json({ error: error.message });
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

  const { data: existing } = await supabase
    .from("task_reactions")
    .select("id")
    .eq("task_id", taskId)
    .eq("user_id", req.user.id)
    .single();

  if (existing) {
    await supabase.from("task_reactions").delete().eq("id", existing.id);
    return res.json({ liked: false });
  }

  await supabase
    .from("task_reactions")
    .insert([{ task_id: taskId, user_id: req.user.id, emoji: "👍" }]);
  res.json({ liked: true });
};