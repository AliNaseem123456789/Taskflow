import { supabase } from "../config/supabase.js";
import { getMembership } from "./teamController.js";
import { todayIn, addDays } from "../utils/time.js";
import { publishToTeam } from "../utils/events.js";
import { myWorkFilter } from "../utils/permissions.js";

const isDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v);
const clean = (v) => String(v ?? "").trim().slice(0, 2000) || null;

// GET /teams/:id/standups?date=YYYY-MM-DD
// Every member, with their standup for that day (or null if they haven't posted)
export const getStandups = async (req, res) => {
  const { id } = req.params;
  if (!(await getMembership(id, req.user.id))) return res.status(403).json({ error: "Not a team member" });
  const date = isDate(req.query.date) ? req.query.date : todayIn(req.user.timezone);

  const [{ data: members }, { data: entries, error }] = await Promise.all([
    supabase.from("team_members").select("user_id, role, users(id, name, email)").eq("team_id", id),
    supabase.from("standups").select("*").eq("team_id", id).eq("date", date),
  ]);
  if (error) return res.status(500).json({ error: error.message });

  res.json({
    date,
    members: (members || []).map((m) => ({
      ...m.users,
      role: m.role,
      standup: (entries || []).find((e) => e.user_id === m.user_id) || null,
    })),
  });
};

// GET /teams/:id/standups/draft -> suggestions from my own tasks
export const getStandupDraft = async (req, res) => {
  const { id } = req.params;
  if (!(await getMembership(id, req.user.id))) return res.status(403).json({ error: "Not a team member" });
  const today = todayIn(req.user.timezone);

  // "Yesterday" = the most recent earlier day with Done tasks (so Monday picks up Friday)
  const { data: lastDay } = await supabase.from("tasks").select("date_logged").or(myWorkFilter(req.user.id))
    .eq("status", "Done").lt("date_logged", today).gte("date_logged", addDays(today, -7))
    .order("date_logged", { ascending: false }).limit(1);
  const previous = lastDay?.[0]?.date_logged;

  const [{ data: done }, { data: open }] = await Promise.all([
    previous
      ? supabase.from("tasks").select("title").or(myWorkFilter(req.user.id))
          .eq("status", "Done").eq("date_logged", previous).limit(15)
      : Promise.resolve({ data: [] }),
    supabase.from("tasks").select("title, blocker").or(myWorkFilter(req.user.id))
      .neq("status", "Done").order("date_logged", { ascending: false }).limit(15),
  ]);
  const bullet = (rows) => rows.map((r) => `• ${r.title}`).join("\n");
  const blocked = (open || []).filter((t) => t.blocker);

  res.json({
    yesterday: bullet(done || []),
    today: bullet(open || []),
    blockers: blocked.map((t) => `• ${t.title}: ${t.blocker}`).join("\n"),
  });
};

// PUT /teams/:id/standups { yesterday, today, blockers, date? }
export const saveStandup = async (req, res) => {
  const { id } = req.params;
  if (!(await getMembership(id, req.user.id))) return res.status(403).json({ error: "Not a team member" });

  const today = todayIn(req.user.timezone);
  const date = isDate(req.body.date) ? req.body.date : today;
  if (date > today) return res.status(400).json({ error: "Can't post a standup for the future" });

  const { data: team } = await supabase.from("teams").select("company_id").eq("id", id).single();
  const row = {
    company_id: team.company_id,
    team_id: id,
    user_id: req.user.id,
    date,
    yesterday: clean(req.body.yesterday),
    today: clean(req.body.today),
    blockers: clean(req.body.blockers),
    updated_at: new Date().toISOString(),
  };
  if (!row.yesterday && !row.today && !row.blockers)
    return res.status(400).json({ error: "Write at least one answer" });

  const { data, error } = await supabase
    .from("standups")
    .upsert(row, { onConflict: "team_id,user_id,date" })
    .select("*")
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
  publishToTeam(id, "standup", { date });
};
