// utils/events.js
// Live updates for open browser tabs (Server-Sent Events).
// Controllers call publish...() after a change; connected users get a small
// event and reload what they're looking at.
//
// Note: this lives in memory, so with several pm2 workers a user only gets
// events from the worker they're connected to. The frontend also re-checks
// every minute, so nothing is missed for long.
import { supabase } from "../config/supabase.js";

const clients = new Map(); // userId -> Set of open responses

export const addClient = (userId, res) => {
  if (!clients.has(userId)) clients.set(userId, new Set());
  clients.get(userId).add(res);
};

export const removeClient = (userId, res) => {
  const set = clients.get(userId);
  if (!set) return;
  set.delete(res);
  if (!set.size) clients.delete(userId);
};

// Send an event to these users (only the ones who are connected)
export const sendTo = (userIds, event, data = {}) => {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const id of new Set(userIds)) {
    clients.get(id)?.forEach((res) => res.write(payload));
  }
};

// Everyone who shares a team with this user, plus the user (their other tabs)
export const publishToTeammates = async (userId, event, data) => {
  if (!clients.size) return;
  try {
    const { data: mine } = await supabase.from("team_members").select("team_id").eq("user_id", userId);
    const teamIds = (mine || []).map((m) => m.team_id);
    let ids = [userId];
    if (teamIds.length) {
      const { data: members } = await supabase.from("team_members").select("user_id").in("team_id", teamIds);
      ids = ids.concat((members || []).map((m) => m.user_id));
    }
    sendTo(ids, event, data);
  } catch (e) {
    console.error("live update failed:", e.message);
  }
};

export const publishToTeam = async (teamId, event, data) => {
  if (!clients.size) return;
  const { data: members } = await supabase.from("team_members").select("user_id").eq("team_id", teamId);
  sendTo((members || []).map((m) => m.user_id), event, data);
};
