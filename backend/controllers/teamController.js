import crypto from "node:crypto";
import { supabase } from "../config/supabase.js";
import { sendEmail, appLink } from "./emailController.js";
import { notify } from "./notificationController.js";
import { todayIn, monthIn, monthRange, clockIn, parseClock, safeTz } from "../utils/time.js";
import { hashToken } from "../utils/session.js";
import { publishToTeam } from "../utils/events.js";
import { postToSlack } from "../utils/slack.js";
import { decrypt } from "../utils/secrets.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

export async function getMembership(teamId, userId) {
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
    slack_webhook: undefined,
    slack_connected: !!team.slack_webhook,
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
  publishToTeam(team.id, "team", {});
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
    .select("*, users(id, name, email), projects(id, name, color), task_tags(tags(id, name, color)), task_reactions(user_id, emoji)")
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
    project: t.projects || null,
    projects: undefined,
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

// Builds the digest text for one team and emails every member.
// `date` is the day to report on (YYYY-MM-DD).
const sendDigest = async (teamId, date) => {
  const { data: team } = await supabase.from("teams").select("name, slack_webhook").eq("id", teamId).single();
  const { data: members } = await supabase
    .from("team_members")
    .select("user_id, users(email, name)")
    .eq("team_id", teamId);
  const memberIds = members.map((m) => m.user_id);

  const [{ data: tasks }, { data: standups }] = await Promise.all([
    supabase.from("tasks").select("user_id, title, status, blocker, projects(name)")
      .in("user_id", memberIds).eq("date_logged", date),
    supabase.from("standups").select("*").eq("team_id", teamId).eq("date", date),
  ]);

  const sections = members.map(({ user_id, users: user }) => {
    const mine = tasks?.filter((t) => t.user_id === user_id) || [];
    const standup = standups?.find((st) => st.user_id === user_id);
    const lines = [`${user.name || user.email}:`];
    if (mine.length)
      mine.forEach((t) =>
        lines.push(`  • [${t.status}] ${t.title}${t.projects ? ` (${t.projects.name})` : ""}${t.blocker ? ` — blocked: ${t.blocker}` : ""}`)
      );
    else lines.push("  (no entries)");
    if (standup) {
      if (standup.today) lines.push(`  Plan: ${standup.today.replace(/\n/g, "\n        ")}`);
      if (standup.blockers) lines.push(`  Blockers: ${standup.blockers.replace(/\n/g, "\n            ")}`);
    }
    return lines.join("\n");
  });

  const body =
    `Team digest for ${team.name} — ${date}\n\n${sections.join("\n\n")}\n\n` +
    `Open the team page: ${appLink("/team")}\n\n— MyDones Team`;

  for (const m of members) {
    await sendEmail(m.users.email, `[${team.name}] Daily digest — ${date}`, body);
  }
  if (team.slack_webhook)
    await postToSlack(decrypt(team.slack_webhook), `*${team.name} — daily digest ${date}*\n\`\`\`${sections.join("\n\n")}\`\`\``);
};

// POST /teams/:id/digest — admin sends it right now
export const sendTeamDigest = async (req, res) => {
  const { id } = req.params;
  const membership = await getMembership(id, req.user.id);
  if (!membership || membership.role !== "admin")
    return res.status(403).json({ error: "Admin only" });

  await sendDigest(id, todayIn(req.user.timezone));
  res.json({ success: true });
};

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// PUT /teams/:id/digest-settings — admin
// { enabled, time: "06:00 PM", days: ["Mon",...], timezone? }
export const updateDigestSettings = async (req, res) => {
  const { id } = req.params;
  const membership = await getMembership(id, req.user.id);
  if (membership?.role !== "admin") return res.status(403).json({ error: "Admin only" });

  const { enabled, time, days, timezone } = req.body;
  if (time !== undefined && !/^(0?[1-9]|1[0-2]):[0-5]\d (AM|PM)$/.test(time))
    return res.status(400).json({ error: 'Time must look like "06:00 PM"' });
  if (days !== undefined && (!Array.isArray(days) || days.some((d) => !WEEKDAYS.includes(d))))
    return res.status(400).json({ error: "Days must be Sun..Sat" });

  const updates = {};
  if (enabled !== undefined) updates.digest_enabled = !!enabled;
  if (time !== undefined) updates.digest_time = time;
  if (days !== undefined) updates.digest_days = days;
  updates.digest_timezone = safeTz(timezone || req.user.timezone);

  const { data, error } = await supabase
    .from("teams")
    .update(updates)
    .eq("id", id)
    .select("digest_enabled, digest_time, digest_days, digest_timezone")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
};

// Cron (every minute): send scheduled digests. Claims digest_last_sent first
// so each team gets one email per day even with several workers.
export const runTeamDigestJob = async () => {
  const { data: teams, error } = await supabase
    .from("teams")
    .select("id, digest_time, digest_days, digest_timezone, digest_last_sent")
    .eq("digest_enabled", true);
  if (error) return console.error("[Cron] digests:", error.message);

  for (const team of teams) {
    const now = clockIn(team.digest_timezone);
    if (!team.digest_days?.includes(now.weekday)) continue;
    const late = now.minutes - parseClock(team.digest_time);
    if (late < 0 || late >= 5) continue;

    const nowIso = new Date().toISOString();
    const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    let { data: claimed } = await supabase.from("teams").update({ digest_last_sent: nowIso })
      .eq("id", team.id).is("digest_last_sent", null).select("id");
    if (!claimed?.length)
      ({ data: claimed } = await supabase.from("teams").update({ digest_last_sent: nowIso })
        .eq("id", team.id).lt("digest_last_sent", cutoff).select("id"));
    if (!claimed?.length) continue;

    await sendDigest(team.id, todayIn(team.digest_timezone)).catch((e) =>
      console.error(`[Cron] digest for team ${team.id}:`, e.message)
    );
  }
};

// ── Invite by email ───────────────────────────────────────────────────────────

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// POST /teams/:id/invites { email } — admin
export const createInvite = async (req, res) => {
  const { id } = req.params;
  const membership = await getMembership(id, req.user.id);
  if (membership?.role !== "admin") return res.status(403).json({ error: "Admin only" });

  const email = String(req.body.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
    return res.status(400).json({ error: "Enter a valid email" });

  const { data: team } = await supabase.from("teams").select("name").eq("id", id).single();
  const { data: existingUser } = await supabase.from("users").select("id").ilike("email", email.replace(/[\\%_]/g, "\\$&")).maybeSingle();
  if (existingUser && (await getMembership(id, existingUser.id)))
    return res.status(400).json({ error: "That person is already in the team" });

  const raw = crypto.randomBytes(24).toString("hex");
  const { data: invite, error } = await supabase
    .from("team_invites")
    .insert([{
      team_id: id,
      email,
      token_hash: hashToken(raw),
      invited_by: req.user.id,
      expires_at: new Date(Date.now() + INVITE_TTL_MS).toISOString(),
    }])
    .select("id, email, expires_at, created_at")
    .single();
  if (error) return res.status(500).json({ error: error.message });

  const link = appLink(`/join?token=${raw}`);
  const { data: me } = await supabase.from("users").select("name, email").eq("id", req.user.id).single();
  const inviter = me?.name || me?.email || "A teammate";
  const sent = await sendEmail(
    email,
    `${inviter} invited you to ${team.name}`,
    `Hi!\n\n${inviter} invited you to join the team "${team.name}" on MyDones.\n\nJoin here: ${link}\n\nThe link works for 7 days. If you don't have an account yet, sign up with this email first.\n\n– MyDones Team`
  );
  if (existingUser)
    await notify(req.user.id, [{
      user_id: existingUser.id, type: "invite", link: `/join?token=${raw}`,
      message: `${inviter} invited you to join ${team.name}`,
    }]);

  res.status(201).json({ ...invite, email_sent: sent });
};

// GET /teams/:id/invites — admin: pending invites
export const getInvites = async (req, res) => {
  const { id } = req.params;
  const membership = await getMembership(id, req.user.id);
  if (membership?.role !== "admin") return res.status(403).json({ error: "Admin only" });
  const { data, error } = await supabase
    .from("team_invites")
    .select("id, email, expires_at, created_at")
    .eq("team_id", id)
    .is("accepted_at", null)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
};

// DELETE /teams/:id/invites/:inviteId — admin
export const revokeInvite = async (req, res) => {
  const { id, inviteId } = req.params;
  const membership = await getMembership(id, req.user.id);
  if (membership?.role !== "admin") return res.status(403).json({ error: "Admin only" });
  await supabase.from("team_invites").delete().eq("id", inviteId).eq("team_id", id);
  res.json({ success: true });
};

const findInvite = async (raw) => {
  if (!raw) return null;
  const { data } = await supabase
    .from("team_invites")
    .select("id, team_id, email, expires_at, accepted_at, teams(name), users!team_invites_invited_by_fkey(name, email)")
    .eq("token_hash", hashToken(raw))
    .maybeSingle();
  return data;
};

// GET /teams/invites/lookup?token= — what the join page shows
export const lookupInvite = async (req, res) => {
  const invite = await findInvite(req.query.token);
  if (!invite) return res.status(404).json({ error: "This invite link is not valid" });
  const expired = new Date(invite.expires_at) < new Date();
  res.json({
    team_name: invite.teams?.name,
    invited_by: invite.users?.name || invite.users?.email,
    email: invite.email,
    status: invite.accepted_at ? "accepted" : expired ? "expired" : "pending",
  });
};

// POST /teams/invites/accept { token }
export const acceptInvite = async (req, res) => {
  const invite = await findInvite(req.body.token);
  if (!invite) return res.status(404).json({ error: "This invite link is not valid" });
  if (invite.accepted_at) return res.status(400).json({ error: "This invite was already used" });
  if (new Date(invite.expires_at) < new Date()) return res.status(400).json({ error: "This invite has expired" });

  const { data: me } = await supabase.from("users").select("email").eq("id", req.user.id).single();
  if (me.email.toLowerCase() !== invite.email.toLowerCase())
    return res.status(403).json({
      error: `This invite is for ${invite.email}. Log in with that email to accept it.`,
    });

  if (!(await getMembership(invite.team_id, req.user.id))) {
    const { error } = await supabase
      .from("team_members")
      .insert([{ team_id: invite.team_id, user_id: req.user.id, role: "member" }]);
    if (error) return res.status(500).json({ error: error.message });
  }
  await supabase.from("team_invites").update({ accepted_at: new Date().toISOString() }).eq("id", invite.id);
  res.json({ success: true, team_id: invite.team_id, team_name: invite.teams?.name });
  publishToTeam(invite.team_id, "team", {});
};
