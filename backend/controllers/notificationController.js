import { supabase } from "../config/supabase.js";
import { sendTo } from "../utils/events.js";
import { sendPushToUsers } from "../utils/push.js";

// Create in-app notifications. Never throws; never notifies the actor.
// items: [{ user_id, type, message, task_id?, link? }]
export const notify = async (actorId, items) => {
  const rows = items
    .filter((n) => n.user_id && n.user_id !== actorId)
    .map((n) => ({ ...n, actor_id: actorId }));
  if (!rows.length) return;
  const { error } = await supabase.from("notifications").insert(rows);
  if (error) return console.error("notify failed:", error.message);
  sendTo(rows.map((r) => r.user_id), "notification", {});
  // also as a browser notification, for people who turned push on
  for (const r of rows)
    sendPushToUsers([r.user_id], { title: "Taskflow", body: r.message, url: r.link || "/dashboard" }).catch(() => {});
};

// GET /notifications  -> { unread, items: [...latest 30] }
export const getNotifications = async (req, res) => {
  const [{ data: items, error }, { count }] = await Promise.all([
    supabase
      .from("notifications")
      .select("*, actor:users!notifications_actor_id_fkey(id, name, email)")
      .eq("user_id", req.user.id)
      .order("created_at", { ascending: false })
      .limit(30),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", req.user.id)
      .is("read_at", null),
  ]);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ unread: count || 0, items });
};

// PUT /notifications/:id/read
export const markRead = async (req, res) => {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("id", req.params.id)
    .eq("user_id", req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
};

// POST /notifications/read-all
export const markAllRead = async (req, res) => {
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("user_id", req.user.id)
    .is("read_at", null);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ success: true });
};
