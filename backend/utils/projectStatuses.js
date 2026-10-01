// utils/projectStatuses.js
// A project's board columns. Each column has a category (todo / in_progress / done)
// that maps onto the simple Done/Doing status the rest of the app uses.
import { supabase } from "../config/supabase.js";
import { WORK_TYPES, legacyStatus } from "./workTypes.js";

export { legacyStatus };
export const CATEGORIES = ["todo", "in_progress", "done"];

// Columns for a project, creating them from the company's kind of work the first time.
export const ensureStatuses = async (projectId) => {
  const { data: existing } = await supabase
    .from("project_statuses").select("*").eq("project_id", projectId).order("position");
  if (existing?.length) return existing;

  const { data: project } = await supabase
    .from("projects").select("id, work_type").eq("id", projectId).maybeSingle();
  if (!project) return [];
  const preset = WORK_TYPES[project.work_type] || WORK_TYPES.general;
  const { data } = await supabase
    .from("project_statuses")
    .insert(preset.statuses.map((s, i) => ({ project_id: projectId, name: s.name, category: s.category, color: s.color, position: i })))
    .select("*");
  return (data || []).sort((a, b) => a.position - b.position);
};

// Which column a task sits in: its own status_id, else the first column that
// fits its plain status (Done -> first "done" column, otherwise first "in progress").
export const columnFor = (task, statuses) => {
  const own = task.status_id && statuses.find((s) => s.id === task.status_id);
  if (own) return own;
  const want = task.status === "Done" ? "done" : "in_progress";
  return statuses.find((s) => s.category === want) || statuses[0] || null;
};

// When only the plain status changes (e.g. ticked Done in My Dones), keep the
// column in step: returns the status_id to store, or undefined for "leave as is".
export const statusIdForLegacy = (legacy, currentStatusId, statuses) => {
  const current = statuses.find((s) => s.id === currentStatusId);
  if (current && (current.category === "done") === (legacy === "Done")) return undefined; // already fits (Delayed counts as not done)
  const want = legacy === "Done" ? "done" : "in_progress";
  return statuses.find((s) => s.category === want)?.id ?? null;
};
