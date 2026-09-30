import { supabase } from "../config/supabase.js";

export const getTags = async (req, res) => {
  const { data, error } = await supabase
    .from("tags")
    .select("*")
    .eq("user_id", req.user.id)
    .order("name");
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
};

export const createTag = async (req, res) => {
  const { name, color = "#6b7280" } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Tag name required" });
  const { data, error } = await supabase
    .from("tags")
    .insert([{ user_id: req.user.id, name: name.trim().toLowerCase(), color }])
    .select("*")
    .single();
  if (error) return res.status(400).json({ error: error.message });
  res.status(201).json(data);
};

export const deleteTag = async (req, res) => {
  const { error } = await supabase
    .from("tags")
    .delete()
    .eq("id", req.params.id)
    .eq("user_id", req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
};