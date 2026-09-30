import crypto from "node:crypto";
import { supabase } from "../config/supabase.js";
import { sendEmail } from "./emailController.js";
import { todayIn, monthIn, monthRange } from "../utils/time.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

async function getMembership(teamId, userId) {
  const { data } = await supabase
    .from("team_members")
    .select("role")
    .eq("team_id", teamId)
    .eq("user_id", userId)
    .single();
  return data; // null if not a member
}

// ── Controllers ───────────────────────────────────────────────────────────────

export const getMyTeams = async (req, res) => {
  const { data, error } = await supabase
    .from("team_members")
    .select("role, joined_at, teams(id, name, invite_code, owner_id, created_at)")
    .eq("user_id", req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json(data.map((m) => ({ ...m.teams, role: m.role })));
};

export const createTeam = async (req, res) => {
  const { name } = req.body;
  if (!name?.trim()) return res.status(400).json({ error: "Team name required" });

  const { data: team, error } = await supabase
    .from("teams")
    .insert([{ name: name.trim(), owner_id: req.user.id }])
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: error.message });

  // Creator becomes admin
  await supabase
    .from("team_members")
    .insert([{ team_id: team.id, user_id: req.user.id, role: "admin" }]);

  res.status(201).json(team);
};

export const getTeam = async (req, res) => {
  const { id } = req.params;
  const membership = await getMembership(id, req.user.id);
  if (!membership) return res.status(403).json({ error: "Not a team member" });

  const { data: team, error } = await supabase
    .from("teams")
    .select("*")
    .eq("id", id)
    .single();
  if (error) return res.status(404).json({ error: "Team not found" });

  const { data: members } = await supabase
    .from("team_members")
    .select("role, joined_at, users(id, email, name)")
    .eq("team_id", id);

  res.json({
    ...team,
    members: members.map((m) => ({ ...m.users, role: m.role, joined_at: m.joined_at })),
    my_role: membership.role,
  });
};

export const joinTeam = async (req, res) => {
  const { invite_code } = req.body;
  if (!invite_code) return res.status(400).json({ error: "Invite code required" });

  const { data: team, error } = await supabase
    .from("teams")
    .select("*")
    .eq("invite_code", invite_code.toUpperCase().trim())
    .single();
  if (error || !team) return res.status(404).json({ error: "Invalid invite code" });

  const { data: existing } = await supabase
    .from("team_members")
    .select("id")
    .eq("team_id", team.id)
    .eq("user_id", req.user.id)
    .single();
  if (existing) return res.status(400).json({ error: "You are already a member of this team" });

  await supabase
    .from("team_members")
    .insert([{ team_id: team.id, user_id: req.user.id, role: "member" }]);

  res.json({ success: true, team });
};

export const leaveTeam = async (req, res) => {
  const { id } = req.params;
  const { data: team } = await supabase
    .from("teams").select("owner_id").eq("id", id).single();
  if (team?.owner_id === req.user.id)
    return res.status(400).json({ error: "Owner cannot leave. Delete the team instead." });

  await supabase.from("team_members").delete().eq("team_id", id).eq("user_id", req.user.id);
  res.json({ success: true });
};

export const removeMember = async (req, res) => {
  const { id, userId } = req.params;
  const membership = await getMembership(id, req.user.id);
  if (!membership || membership.role !== "admin")
    return res.status(403).json({ error: "Admin only" });

  await supabase.from("team_members").delete().eq("team_id", id).eq("user_id", userId);
  res.json({ success: true });
};

export const updateMemberRole = async (req, res) => {
  const { id, userId } = req.params;
  const { role } = req.body;
  if (!["admin", "member"].includes(role))
    return res.status(400).json({ error: "Invalid role" });

  const membership = await getMembership(id, req.user.id);
  if (!membership || membership.role !== "admin")
    return res.status(403).json({ error: "Admin only" });

  const { data, error } = await supabase
    .from("team_members")
    .update({ role })
    .eq("team_id", id)
    .eq("user_id", userId)
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
};

export const regenerateInvite = async (req, res) => {
  const { id } = req.params;
  const { data: team } = await supabase.from("teams").select("owner_id").eq("id", id).single();
  if (team?.owner_id !== req.user.id) return res.status(403).json({ error: "Owner only" });

  const newCode = crypto.randomBytes(4).toString("hex").slice(0, 6).toUpperCase();
  const { data, error } = await supabase
    .from("teams")
    .update({ invite_code: newCode })
    .eq("id", id)
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
};

export const deleteTeam = async (req, res) => {
  const { id } = req.params;
  const { data: team } = await supabase.from("teams").select("owner_id").eq("id", id).single();
  if (team?.owner_id !== req.user.id) return res.status(403).json({ error: "Owner only" });

  await supabase.from("teams").delete().eq("id", id);
  res.json({ success: true });
};

// ── Team feed ─────────────────────────────────────────────────────────────────

export const getTeamFeed = async (req, res) => {
  const { id } = req.params;
  const { date, month } = req.query;

  const { data: members, error: membErr } = await supabase
    .from("team_members")
    .select("user_id, role, users(id, email, name)")
    .eq("team_id", id);
  if (membErr) return res.status(500).json({ error: membErr.message });

  const memberIds = members.map((m) => m.user_id);
  if (!memberIds.includes(req.user.id)) return res.status(403).json({ error: "Not a member" });

  let query = supabase
    .from("tasks")
    .select("*, users(id, name, email), task_tags(tags(id, name, color)), task_reactions(user_id, emoji)")
    .in("user_id", memberIds);

  if (date) {
    query = query.eq("date_logged", date);
  } else if (month) {
    const range = monthRange(month);
    query = query.gte("date_logged", range.start).lte("date_logged", range.end);
  } else {
    query = query.eq("date_logged", todayIn(req.user.timezone));
  }

  const { data: tasks, error } = await query.order("date_logged", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });

  const normalised = tasks.map((t) => ({
    ...t,
    tags: t.task_tags?.map((tt) => tt.tags).filter(Boolean) || [],
    reactions: t.task_reactions || [],
    task_tags: undefined,
    task_reactions: undefined,
  }));

  // Group tasks by member
  const memberMap = {};
  members.forEach((m) => {
    memberMap[m.user_id] = { ...m.users, role: m.role, tasks: [] };
  });
  normalised.forEach((t) => {
    if (memberMap[t.user_id]) memberMap[t.user_id].tasks.push(t);
  });

  res.json(Object.values(memberMap));
};

// ── Manager stats ─────────────────────────────────────────────────────────────

export const getTeamStats = async (req, res) => {
  const { id } = req.params;
  const { month } = req.query;

  const { data: members } = await supabase
    .from("team_members")
    .select("user_id, role, users(id, email, name)")
    .eq("team_id", id);

  const memberIds = members?.map((m) => m.user_id) || [];
  if (!memberIds.includes(req.user.id)) return res.status(403).json({ error: "Not a member" });

  const range = monthRange(month || monthIn(req.user.timezone));

  const { data: tasks } = await supabase
    .from("tasks")
    .select("user_id, status, date_logged")
    .in("user_id", memberIds)
    .gte("date_logged", range.start)
    .lte("date_logged", range.end);

  const stats = members.map((mem) => {
    const userTasks = tasks?.filter((t) => t.user_id === mem.user_id) || [];
    const done = userTasks.filter((t) => t.status === "Done").length;
    return {
      ...mem.users,
      role: mem.role,
      total: userTasks.length,
      done,
      doing: userTasks.filter((t) => t.status === "Doing").length,
      delayed: userTasks.filter((t) => t.status === "Delayed").length,
      completion_rate: userTasks.length ? Math.round((done / userTasks.length) * 100) : 0,
      active_days: [...new Set(userTasks.map((t) => t.date_logged))].length,
    };
  });

  res.json(stats);
};

// ── Team digest email ─────────────────────────────────────────────────────────

export const sendTeamDigest = async (req, res) => {
  const { id } = req.params;

  const membership = await getMembership(id, req.user.id);
  if (!membership || membership.role !== "admin")
    return res.status(403).json({ error: "Admin only" });

  const { data: team } = await supabase.from("teams").select("name").eq("id", id).single();
  const { data: members } = await supabase
    .from("team_members")
    .select("user_id, users(email, name)")
    .eq("team_id", id);

  const memberIds = members.map((m) => m.user_id);
  const today = todayIn(req.user.timezone);

  const { data: tasks } = await supabase
    .from("tasks")
    .select("user_id, title, status")
    .in("user_id", memberIds)
    .eq("date_logged", today);

  const memberMap = {};
  members.forEach((m) => { memberMap[m.user_id] = m.users; });

  const lines = memberIds.map((uid) => {
    const user = memberMap[uid];
    const userTasks = tasks?.filter((t) => t.user_id === uid) || [];
    const taskLines = userTasks.length
      ? userTasks.map((t) => `  • [${t.status}] ${t.title}`).join("\n")
      : "  (no entries today)";
    return `${user.name || user.email}:\n${taskLines}`;
  });

  const body = `Team digest for ${team.name} — ${today}\n\n${lines.join("\n\n")}\n\n— MyDones Team`;

  for (const mem of members) {
    await sendEmail(mem.users.email, `[${team.name}] Daily digest — ${today}`, body);
  }

  res.json({ success: true });
};