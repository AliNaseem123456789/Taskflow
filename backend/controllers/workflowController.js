// controllers/workflowController.js
// Phase D step 4: custom fields on project tasks, request forms that turn into
// tasks, and approvals on tasks.
import { supabase } from "../config/supabase.js";
import { notify } from "./notificationController.js";
import { canUseProject } from "./projectController.js";
import { getMembership } from "./teamController.js";
import { getCompanyMember, isCompanyAdmin, can, taskAccess } from "../utils/permissions.js";
import { audit } from "../utils/audit.js";
import { publishToTeam } from "../utils/events.js";
import { todayIn } from "../utils/time.js";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const FIELD_KINDS = ["text", "number", "select", "date", "person", "checkbox"];
const QUESTION_KINDS = ["text", "textarea", "number", "select", "date"];
const PRIORITIES = ["low", "medium", "high", "urgent"];
const clip = (v, n) => String(v ?? "").trim().slice(0, n);

// ═════════════════════════════ Custom fields ═══════════════════════════════

const projectOf = async (teamId, projectId) => {
  if (!UUID_RE.test(projectId || "")) return null;
  const { data } = await supabase.from("projects").select("id, name, team_id, company_id").eq("id", projectId).eq("team_id", teamId).maybeSingle();
  return data;
};

const loadFields = async (projectId) => {
  const { data } = await supabase.from("project_fields").select("*").eq("project_id", projectId).order("position").order("created_at");
  return data || [];
};

// Clean the choices of a dropdown field
const readOptions = (kind, options) => {
  if (kind !== "select") return { options: [] };
  const list = [...new Set((Array.isArray(options) ? options : []).map((o) => clip(o, 60)).filter(Boolean))].slice(0, 30);
  if (!list.length) return { error: "A dropdown needs at least one choice" };
  return { options: list };
};

// GET /teams/:id/projects/:projectId/fields
export const getFields = async (req, res) => {
  const project = await projectOf(req.params.id, req.params.projectId);
  if (!project || !(await canUseProject(req.user.id, project.id))) return res.status(404).json({ error: "Project not found" });
  const membership = await getMembership(req.params.id, req.user.id);
  res.json({ fields: await loadFields(project.id), can_edit: membership?.role === "admin" });
};

// lead / admin of the project's team
const fieldEditor = async (req, res) => {
  const project = await projectOf(req.params.id, req.params.projectId);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return null;
  }
  const membership = await getMembership(req.params.id, req.user.id);
  if (membership?.role !== "admin") {
    res.status(403).json({ error: "Only the team's lead can change fields" });
    return null;
  }
  return project;
};

// POST /teams/:id/projects/:projectId/fields { name, kind, options? }
export const createField = async (req, res) => {
  const project = await fieldEditor(req, res);
  if (!project) return;
  const name = clip(req.body.name, 60);
  if (!name) return res.status(400).json({ error: "Name the field" });
  if (!FIELD_KINDS.includes(req.body.kind)) return res.status(400).json({ error: "Pick a field type" });
  const { options, error } = readOptions(req.body.kind, req.body.options);
  if (error) return res.status(400).json({ error });
  const existing = await loadFields(project.id);
  if (existing.length >= 20) return res.status(400).json({ error: "A project can have up to 20 fields" });
  if (existing.some((f) => f.name.toLowerCase() === name.toLowerCase())) return res.status(400).json({ error: "There's already a field with that name" });
  const { data, error: e2 } = await supabase.from("project_fields")
    .insert([{ project_id: project.id, name, kind: req.body.kind, options, position: existing.length }]).select("*").single();
  if (e2) return res.status(500).json({ error: e2.message });
  await audit(req, project.company_id, "project.field_added", "project", project.id, { name, kind: req.body.kind });
  res.status(201).json(data);
  publishToTeam(project.team_id, "project", {});
};

// PUT /teams/:id/projects/:projectId/fields/:fieldId { name?, options?, position? }
export const updateField = async (req, res) => {
  const project = await fieldEditor(req, res);
  if (!project) return;
  const { data: field } = await supabase.from("project_fields").select("*").eq("id", req.params.fieldId).eq("project_id", project.id).maybeSingle();
  if (!field) return res.status(404).json({ error: "Field not found" });
  const u = {};
  if (req.body.name !== undefined) {
    u.name = clip(req.body.name, 60);
    if (!u.name) return res.status(400).json({ error: "Name the field" });
  }
  if (req.body.options !== undefined) {
    const { options, error } = readOptions(field.kind, req.body.options);
    if (error) return res.status(400).json({ error });
    u.options = options;
  }
  if (req.body.position !== undefined) u.position = Math.max(0, Math.min(100, Number(req.body.position) || 0));
  const { data, error } = await supabase.from("project_fields").update(u).eq("id", field.id).select("*").single();
  if (error) return res.status(500).json({ error: error.message });
  res.json(data);
  publishToTeam(project.team_id, "project", {});
};

// DELETE /teams/:id/projects/:projectId/fields/:fieldId (its values go with it)
export const deleteField = async (req, res) => {
  const project = await fieldEditor(req, res);
  if (!project) return;
  await supabase.from("project_fields").delete().eq("id", req.params.fieldId).eq("project_id", project.id);
  res.json({ success: true });
  publishToTeam(project.team_id, "project", {});
};

// Check one value against its field; returns { value } (null = clear) or { error }
const checkValue = async (field, raw, companyId) => {
  if (raw === null || raw === undefined || raw === "") return { value: null };
  switch (field.kind) {
    case "text": return { value: clip(raw, 500) || null };
    case "number": {
      const n = Number(raw);
      return Number.isFinite(n) && Math.abs(n) < 1e12 ? { value: n } : { error: `${field.name} must be a number` };
    }
    case "select": return field.options.includes(raw) ? { value: raw } : { error: `${field.name}: pick one of the choices` };
    case "date": return DATE_RE.test(raw) ? { value: raw } : { error: `${field.name} must be a date` };
    case "checkbox": return { value: raw === true || raw === "true" };
    case "person":
      if (!UUID_RE.test(raw) || !(await getCompanyMember(companyId, raw))) return { error: `${field.name}: pick someone in the company` };
      return { value: raw };
    default: return { error: "Unknown field" };
  }
};

// Save several values on a task (used by the task page and by request forms)
const saveValues = async (task, values) => {
  const fields = await loadFields(task.project_id);
  const byId = Object.fromEntries(fields.map((f) => [f.id, f]));
  const upserts = [];
  const clears = [];
  for (const [fieldId, raw] of Object.entries(values || {})) {
    const field = byId[fieldId];
    if (!field) return { error: "That field isn't on this task's project" };
    const { value, error } = await checkValue(field, raw, task.company_id);
    if (error) return { error };
    if (value === null) clears.push(fieldId);
    else upserts.push({ task_id: task.id, field_id: fieldId, value, updated_at: new Date().toISOString() });
  }
  if (upserts.length) {
    const { error } = await supabase.from("task_field_values").upsert(upserts, { onConflict: "task_id,field_id" });
    if (error) return { error: error.message };
  }
  if (clears.length) await supabase.from("task_field_values").delete().eq("task_id", task.id).in("field_id", clears);
  return {};
};

// { [taskId]: { [fieldId]: value } } for a list of tasks (board and list views)
export const fieldValuesFor = async (taskIds) => {
  if (!taskIds.length) return {};
  const { data } = await supabase.from("task_field_values").select("task_id, field_id, value").in("task_id", taskIds);
  const out = {};
  for (const v of data || []) (out[v.task_id] = out[v.task_id] || {})[v.field_id] = v.value;
  return out;
};

const taskRow = async (id) => {
  const { data } = await supabase.from("tasks").select("*").eq("id", Number(id)).maybeSingle();
  return data;
};

// GET /tasks/:id/fields -> { fields, values, can_edit }
export const getTaskFields = async (req, res) => {
  const task = await taskRow(req.params.id);
  const access = await taskAccess(task, req.user.id);
  if (!access.canView) return res.status(404).json({ error: "Task not found" });
  if (!task.project_id) return res.json({ fields: [], values: {}, can_edit: false });
  res.json({ fields: await loadFields(task.project_id), values: (await fieldValuesFor([task.id]))[task.id] || {}, can_edit: access.canEdit });
};

// PUT /tasks/:id/fields { values: { fieldId: value | null } }
export const setTaskFields = async (req, res) => {
  const task = await taskRow(req.params.id);
  const access = await taskAccess(task, req.user.id);
  if (!access.canView) return res.status(404).json({ error: "Task not found" });
  if (!access.canEdit) return res.status(403).json({ error: "You can't edit this task" });
  if (!task.project_id) return res.status(400).json({ error: "Only tasks in a project have fields" });
  const { error } = await saveValues(task, req.body.values);
  if (error) return res.status(400).json({ error });
  res.json({ values: (await fieldValuesFor([task.id]))[task.id] || {} });
  if (task.team_id) publishToTeam(task.team_id, "task", { id: task.id });
};

// ═════════════════════════════ Request forms ═══════════════════════════════

const memberOr403 = async (req, res) => {
  const member = await getCompanyMember(req.params.id, req.user.id);
  if (!member) {
    res.status(404).json({ error: "Company not found" });
    return null;
  }
  return member;
};

// Admins, managers, and the lead of the target project's team edit a form
const canEditForm = async (member, form, userId) => {
  if (isCompanyAdmin(member) || can(member, "transfers.approve")) return true;
  if (form.created_by === userId) return true;
  const { data: project } = await supabase.from("projects").select("team_id").eq("id", form.project_id).maybeSingle();
  return !!project && (await getMembership(project.team_id, userId))?.role === "admin";
};

// Check the questions of a form against its project
const readQuestions = async (list, projectId) => {
  if (!Array.isArray(list) || !list.length) return { error: "Add at least one question" };
  if (list.length > 30) return { error: "A form can have up to 30 questions" };
  const fieldIds = new Set((await loadFields(projectId)).map((f) => f.id));
  const used = new Set();
  const out = [];
  for (const [i, q] of list.entries()) {
    const label = clip(q.label, 200);
    if (!label) return { error: `Question ${i + 1} needs a label` };
    if (!QUESTION_KINDS.includes(q.kind)) return { error: `Question ${i + 1}: pick a type` };
    const maps_to = q.maps_to ? String(q.maps_to) : "";
    if (maps_to && !["title", "description", "due_date", "priority"].includes(maps_to) && !(maps_to.startsWith("field:") && fieldIds.has(maps_to.slice(6))))
      return { error: `Question ${i + 1}: that task field doesn't exist` };
    if (maps_to) {
      if (used.has(maps_to)) return { error: "Two questions fill the same task field" };
      used.add(maps_to);
    }
    if (maps_to === "due_date" && q.kind !== "date") return { error: `"${label}" fills the due date, so it must be a date question` };
    const options = q.kind === "select" ? [...new Set((q.options || []).map((o) => clip(o, 60)).filter(Boolean))].slice(0, 30) : [];
    if (q.kind === "select" && !options.length) return { error: `"${label}" needs choices` };
    if (maps_to === "priority" && (q.kind !== "select" || options.some((o) => !PRIORITIES.includes(o.toLowerCase()))))
      return { error: `"${label}" fills the priority, so its choices must be low, medium, high or urgent` };
    out.push({ id: clip(q.id, 40) || `q${i + 1}`, label, kind: q.kind, required: !!q.required || maps_to === "title", options, maps_to, help: clip(q.help, 200) || undefined });
  }
  if (new Set(out.map((q) => q.id)).size !== out.length) out.forEach((q, i) => (q.id = `q${i + 1}`));
  return { questions: out };
};

const readForm = async (body, companyId, partial, current) => {
  const u = {};
  const projectId = body.project_id ?? current?.project_id;
  if (body.project_id !== undefined || !partial) {
    if (!UUID_RE.test(projectId || "")) return { error: "Pick the project that gets the requests" };
    const { data: project } = await supabase.from("projects").select("id, company_id, archived").eq("id", projectId).maybeSingle();
    if (!project || project.company_id !== companyId) return { error: "Project not found" };
    u.project_id = projectId;
  }
  if (body.name !== undefined || !partial) {
    u.name = clip(body.name, 120);
    if (!u.name) return { error: "Name the form" };
  }
  if (body.description !== undefined) u.description = clip(body.description, 2000) || null;
  if (body.default_priority !== undefined) {
    if (!PRIORITIES.includes(body.default_priority)) return { error: "Invalid priority" };
    u.default_priority = body.default_priority;
  }
  if (body.assignee_id !== undefined) {
    if (body.assignee_id && !(await getCompanyMember(companyId, body.assignee_id))) return { error: "The assignee must be in the company" };
    u.assignee_id = body.assignee_id || null;
  }
  if (body.is_open !== undefined) u.is_open = !!body.is_open;
  if (body.questions !== undefined || !partial || u.project_id) {
    const { questions, error } = await readQuestions(body.questions ?? current?.questions, projectId);
    if (error) return { error };
    u.questions = questions;
  }
  return { u };
};

// GET /companies/:id/forms -> { forms, my_requests, can_create }
export const getForms = async (req, res) => {
  const member = await memberOr403(req, res);
  if (!member) return;
  const { data, error } = await supabase.from("request_forms")
    .select("*, project:projects!project_id(id, name, color, team_id), request_submissions(id)")
    .eq("company_id", req.params.id).order("name");
  if (error) return res.status(500).json({ error: error.message });
  const forms = [];
  for (const { request_submissions: subs, ...f } of data) {
    const editable = await canEditForm(member, f, req.user.id);
    if (!f.is_open && !editable) continue;
    forms.push({ ...f, can_edit: editable, submissions: editable ? subs.length : undefined });
  }
  const { data: mine } = await supabase.from("request_submissions")
    .select("id, created_at, form:request_forms!form_id!inner(id, name, company_id), task:tasks!task_id(id, title, status)")
    .eq("submitted_by", req.user.id).eq("form.company_id", req.params.id).order("created_at", { ascending: false }).limit(20);
  const canCreate = isCompanyAdmin(member) || can(member, "transfers.approve") || can(member, "project.create");
  res.json({ forms, my_requests: mine || [], can_create: canCreate });
};

const loadForm = async (req) => {
  if (!UUID_RE.test(req.params.formId || "")) return null;
  const { data } = await supabase.from("request_forms").select("*, project:projects!project_id(id, name, color, team_id)")
    .eq("id", req.params.formId).eq("company_id", req.params.id).maybeSingle();
  return data;
};

// GET /companies/:id/forms/:formId
export const getForm = async (req, res) => {
  const member = await memberOr403(req, res);
  if (!member) return;
  const form = await loadForm(req);
  const editable = form && (await canEditForm(member, form, req.user.id));
  if (!form || (!form.is_open && !editable)) return res.status(404).json({ error: "Form not found" });
  // the editor needs the project's fields to map questions onto
  const fields = editable ? await loadFields(form.project_id) : undefined;
  res.json({ ...form, can_edit: editable, can_submit: form.is_open && can(member, "task.create"), fields });
};

// POST /companies/:id/forms
export const createForm = async (req, res) => {
  const member = await memberOr403(req, res);
  if (!member) return;
  const { u, error } = await readForm(req.body, req.params.id, false);
  if (error) return res.status(400).json({ error });
  if (!(await canEditForm(member, { project_id: u.project_id }, req.user.id)))
    return res.status(403).json({ error: "Admins, managers and the project's team lead create its forms" });
  const { data, error: e2 } = await supabase.from("request_forms")
    .insert([{ ...u, company_id: req.params.id, created_by: req.user.id }]).select("*").single();
  if (e2) return res.status(500).json({ error: e2.message });
  await audit(req, req.params.id, "form.created", "request_form", data.id, { name: data.name });
  res.status(201).json(data);
};

// PUT /companies/:id/forms/:formId
export const updateForm = async (req, res) => {
  const member = await memberOr403(req, res);
  if (!member) return;
  const form = await loadForm(req);
  if (!form) return res.status(404).json({ error: "Form not found" });
  if (!(await canEditForm(member, form, req.user.id))) return res.status(403).json({ error: "You can't edit this form" });
  const { u, error } = await readForm(req.body, req.params.id, true, form);
  if (error) return res.status(400).json({ error });
  if (u.project_id && u.project_id !== form.project_id && !(await canEditForm(member, { project_id: u.project_id }, req.user.id)))
    return res.status(403).json({ error: "You can't send requests to that project" });
  const { data, error: e2 } = await supabase.from("request_forms").update(u).eq("id", form.id).select("*").single();
  if (e2) return res.status(500).json({ error: e2.message });
  res.json(data);
};

// DELETE /companies/:id/forms/:formId (the tasks it created stay)
export const deleteForm = async (req, res) => {
  const member = await memberOr403(req, res);
  if (!member) return;
  const form = await loadForm(req);
  if (!form) return res.status(404).json({ error: "Form not found" });
  if (!(await canEditForm(member, form, req.user.id))) return res.status(403).json({ error: "You can't delete this form" });
  await supabase.from("request_forms").delete().eq("id", form.id);
  await audit(req, req.params.id, "form.deleted", "request_form", form.id, { name: form.name });
  res.json({ success: true });
};

// POST /companies/:id/forms/:formId/submit { answers: { questionId: value } }
export const submitForm = async (req, res) => {
  const member = await memberOr403(req, res);
  if (!member) return;
  if (!can(member, "task.create")) return res.status(403).json({ error: "Viewers can't send requests" });
  const form = await loadForm(req);
  if (!form || !form.is_open) return res.status(404).json({ error: "This form isn't taking requests" });

  const answers = req.body.answers || {};
  const clean = {};
  for (const q of form.questions) {
    let v = answers[q.id];
    if (typeof v === "string") v = v.trim();
    if (v === undefined || v === null || v === "") {
      if (q.required) return res.status(400).json({ error: `"${q.label}" is required` });
      continue;
    }
    if (q.kind === "number" && !Number.isFinite(Number(v))) return res.status(400).json({ error: `"${q.label}" must be a number` });
    if (q.kind === "date" && !DATE_RE.test(v)) return res.status(400).json({ error: `"${q.label}" must be a date` });
    if (q.kind === "select" && !q.options.includes(v)) return res.status(400).json({ error: `"${q.label}": pick one of the choices` });
    clean[q.id] = q.kind === "number" ? Number(v) : String(v).slice(0, q.kind === "textarea" ? 5000 : 500);
  }

  // build the task
  const { data: me } = await supabase.from("users").select("name, email").eq("id", req.user.id).single();
  const byMap = Object.fromEntries(form.questions.filter((q) => q.maps_to && clean[q.id] !== undefined).map((q) => [q.maps_to, clean[q.id]]));
  const rest = form.questions.filter((q) => !q.maps_to && clean[q.id] !== undefined);
  const description = [
    byMap.description,
    rest.length ? rest.map((q) => `${q.label}: ${clean[q.id]}`).join("\n") : null,
    `Requested by ${me?.name || me?.email} via "${form.name}"`,
  ].filter(Boolean).join("\n\n");
  const { data: project } = await supabase.from("projects").select("id, team_id, company_id, name").eq("id", form.project_id).single();
  const { data: task, error } = await supabase.from("tasks").insert([{
    title: String(byMap.title || `${form.name}: ${me?.name || me?.email}`).slice(0, 200),
    description: description.slice(0, 10000),
    status: "Doing",
    priority: byMap.priority ? String(byMap.priority).toLowerCase() : form.default_priority,
    due_date: byMap.due_date || null,
    company_id: form.company_id, team_id: project.team_id, project_id: project.id,
    user_id: req.user.id,
    assignee_id: form.assignee_id || form.created_by || req.user.id,
    date_logged: todayIn(req.user.timezone),
  }]).select("*").single();
  if (error) return res.status(500).json({ error: error.message });

  const fieldValues = Object.fromEntries(Object.entries(byMap).filter(([k]) => k.startsWith("field:")).map(([k, v]) => [k.slice(6), v]));
  if (Object.keys(fieldValues).length) await saveValues(task, fieldValues); // answers that don't fit the field are kept in the answers only
  const { data: sub } = await supabase.from("request_submissions")
    .insert([{ form_id: form.id, task_id: task.id, submitted_by: req.user.id, answers: clean }]).select("id").single();

  // tell the assignee and the team's leads
  const { data: leads } = await supabase.from("team_members").select("user_id").eq("team_id", project.team_id).eq("role", "lead");
  const people = [...new Set([task.assignee_id, ...(leads || []).map((l) => l.user_id)])];
  await notify(req.user.id, people.map((uid) => ({
    user_id: uid, type: "request", link: `/tasks/${task.id}`, message: `New request via ${form.name}: ${task.title.slice(0, 80)}`,
  })));
  publishToTeam(project.team_id, "task", { id: task.id });
  res.status(201).json({ task_id: task.id, submission_id: sub?.id });
};

// GET /companies/:id/forms/:formId/submissions (form editors)
export const getSubmissions = async (req, res) => {
  const member = await memberOr403(req, res);
  if (!member) return;
  const form = await loadForm(req);
  if (!form) return res.status(404).json({ error: "Form not found" });
  if (!(await canEditForm(member, form, req.user.id))) return res.status(403).json({ error: "Only the form's editors see its requests" });
  const { data } = await supabase.from("request_submissions")
    .select("id, created_at, answers, submitter:users!submitted_by(id, name, email), task:tasks!task_id(id, title, status, assignee_id)")
    .eq("form_id", form.id).order("created_at", { ascending: false }).limit(200);
  res.json(data || []);
};

// ═════════════════════════════ Approvals ═══════════════════════════════════

const APPROVAL_SELECT = "*, approver:users!approver_id(id, name, email), requester:users!requested_by(id, name, email), task:tasks!task_id(id, title, status, company_id)";

// GET /tasks/:id/approvals
export const getTaskApprovals = async (req, res) => {
  const task = await taskRow(req.params.id);
  const access = await taskAccess(task, req.user.id);
  if (!access.canView) return res.status(404).json({ error: "Task not found" });
  if (!task.company_id) return res.json({ approvals: [], can_request: false });
  const { data } = await supabase.from("approvals").select(APPROVAL_SELECT).eq("task_id", task.id).order("created_at", { ascending: false });
  res.json({ approvals: data || [], can_request: access.canEdit });
};

// POST /tasks/:id/approvals { approver_ids: [], note? }
export const requestApproval = async (req, res) => {
  const task = await taskRow(req.params.id);
  const access = await taskAccess(task, req.user.id);
  if (!access.canView) return res.status(404).json({ error: "Task not found" });
  if (!task.company_id) return res.status(400).json({ error: "Approvals are for company tasks" });
  if (!access.canEdit) return res.status(403).json({ error: "You can't ask for approval on this task" });
  const ids = [...new Set((Array.isArray(req.body.approver_ids) ? req.body.approver_ids : []).filter((x) => UUID_RE.test(x)))];
  if (!ids.length) return res.status(400).json({ error: "Pick who should approve" });
  if (ids.length > 10) return res.status(400).json({ error: "Up to 10 approvers at a time" });
  if (ids.includes(req.user.id)) return res.status(400).json({ error: "You can't approve your own request" });
  for (const uid of ids) {
    if (!(await taskAccess(task, uid)).canView) {
      const { data: u } = await supabase.from("users").select("name, email").eq("id", uid).maybeSingle();
      return res.status(400).json({ error: `${u?.name || u?.email || "That person"} can't see this task — add them to the team or project first` });
    }
  }
  const { data: open } = await supabase.from("approvals").select("approver_id").eq("task_id", task.id).eq("status", "pending");
  const fresh = ids.filter((uid) => !(open || []).some((o) => o.approver_id === uid));
  if (!fresh.length) return res.status(400).json({ error: "They already have an open request on this task" });
  const note = clip(req.body.note, 1000) || null;
  const { data, error } = await supabase.from("approvals")
    .insert(fresh.map((uid) => ({ task_id: task.id, company_id: task.company_id, requested_by: req.user.id, approver_id: uid, note })))
    .select(APPROVAL_SELECT);
  if (error) return res.status(500).json({ error: error.message });
  await notify(req.user.id, fresh.map((uid) => ({
    user_id: uid, type: "approval", link: `/tasks/${task.id}`, message: `Your approval is needed: ${task.title.slice(0, 80)}`,
  })));
  await audit(req, task.company_id, "approval.requested", "task", String(task.id), { approvers: fresh.length });
  res.status(201).json(data);
  if (task.team_id) publishToTeam(task.team_id, "task", { id: task.id });
};

const loadApproval = async (id) => {
  if (!UUID_RE.test(id || "")) return null;
  const { data } = await supabase.from("approvals").select(APPROVAL_SELECT).eq("id", id).maybeSingle();
  return data;
};

// POST /approvals/:id/decide { decision: "approve" | "reject", comment? }
export const decideApproval = async (req, res) => {
  const a = await loadApproval(req.params.id);
  if (!a || a.approver_id !== req.user.id) return res.status(404).json({ error: "Approval not found" });
  if (a.status !== "pending") return res.status(400).json({ error: `Already ${a.status}` });
  if (!(await getCompanyMember(a.company_id, req.user.id))) return res.status(403).json({ error: "You're no longer in this company" });
  if (!["approve", "reject"].includes(req.body.decision)) return res.status(400).json({ error: "Approve or reject" });
  const comment = clip(req.body.comment, 2000) || null;
  if (req.body.decision === "reject" && !comment) return res.status(400).json({ error: "Say why you're rejecting it" });
  const status = req.body.decision === "approve" ? "approved" : "rejected";
  const { data, error } = await supabase.from("approvals")
    .update({ status, comment, decided_at: new Date().toISOString() }).eq("id", a.id).eq("status", "pending").select(APPROVAL_SELECT).single();
  if (error || !data) return res.status(409).json({ error: "Someone changed this request — reload" });
  const { data: task } = await supabase.from("tasks").select("id, title, assignee_id, team_id").eq("id", a.task_id).single();
  await notify(req.user.id, [...new Set([a.requested_by, task.assignee_id])].map((uid) => ({
    user_id: uid, type: "approval", link: `/tasks/${task.id}`,
    message: `${status === "approved" ? "Approved" : "Rejected"}: ${task.title.slice(0, 80)}${comment ? ` — ${comment.slice(0, 80)}` : ""}`,
  })));
  await audit(req, a.company_id, `approval.${status}`, "task", String(a.task_id), { comment: !!comment });
  res.json(data);
  if (task.team_id) publishToTeam(task.team_id, "task", { id: task.id });
};

// DELETE /approvals/:id — the requester withdraws an open request
export const cancelApproval = async (req, res) => {
  const a = await loadApproval(req.params.id);
  if (!a || a.requested_by !== req.user.id) return res.status(404).json({ error: "Approval not found" });
  if (a.status !== "pending") return res.status(400).json({ error: `Already ${a.status}` });
  await supabase.from("approvals").update({ status: "cancelled", decided_at: new Date().toISOString() }).eq("id", a.id);
  res.json({ success: true });
};

// GET /approvals?box=to_me|by_me&status=pending|decided
// Company workspace: that company. Personal: all my companies.
export const getApprovals = async (req, res) => {
  const box = req.query.box === "by_me" ? "by_me" : "to_me";
  let q = supabase.from("approvals").select(APPROVAL_SELECT)
    .eq(box === "to_me" ? "approver_id" : "requested_by", req.user.id)
    .order("created_at", { ascending: false }).limit(100);
  if (req.company) q = q.eq("company_id", req.company.id);
  if (req.query.status === "pending") q = q.eq("status", "pending");
  else if (req.query.status === "decided") q = q.neq("status", "pending");
  const { data, error } = await q;
  if (error) return res.status(500).json({ error: error.message });
  // drop rows from companies you've left
  const out = [];
  const seen = {};
  for (const a of data) {
    if (seen[a.company_id] === undefined) seen[a.company_id] = !!(await getCompanyMember(a.company_id, req.user.id));
    if (seen[a.company_id]) out.push(a);
  }
  res.json(out);
};
