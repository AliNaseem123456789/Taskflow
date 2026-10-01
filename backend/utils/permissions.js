// utils/permissions.js
// Every "is this person allowed to…" question lives here, so the rules are
// in one file. Roles are per company; "lead" is per team.
import { supabase } from "../config/supabase.js";

export const COMPANY_ROLES = ["owner", "admin", "manager", "member", "guest", "viewer"];
export const TEAM_ROLES = ["lead", "member"];

const ADMINS = ["owner", "admin"];

// The role matrix from the Phase A design (company-wide actions).
// Team- and project-level rules are in teamAccess() / taskScope() below.
const RULES = {
  "company.delete": ["owner"],
  "company.transfer_ownership": ["owner"],
  "company.settings": ADMINS,
  "members.change_role": ADMINS,
  "members.remove": ADMINS,
  "members.edit_profile": [...ADMINS, "manager"], // job title, level, manager
  "members.invite": [...ADMINS, "manager"],
  "audit.view": ADMINS,
  "structure.edit": ADMINS, // departments, teams
  "transfers.approve": [...ADMINS, "manager"],
  "announcements.post": ADMINS,
  "project.create": [...ADMINS, "manager", "member"],
  "task.create": [...ADMINS, "manager", "member", "guest"],
  "directory.view": [...ADMINS, "manager", "member", "viewer"],
};

// can(member, "members.invite") -> true/false. `member` is a company_members row.
export const can = (member, action) => {
  if (!member || member.status === "left") return false;
  const allowed = RULES[action];
  if (!allowed) throw new Error(`Unknown permission: ${action}`);
  return allowed.includes(member.role);
};

export const isCompanyAdmin = (member) => !!member && ADMINS.includes(member.role);

// Active membership of a user in a company, or null
export const getCompanyMember = async (companyId, userId) => {
  if (!companyId || !userId) return null;
  const { data } = await supabase
    .from("company_members")
    .select("*")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();
  return data;
};

// Everything about one person's access to one team.
// canView: see the team, its feed and projects. canManage: members, projects, settings.
export const teamAccess = async (teamId, userId) => {
  const { data: team } = await supabase.from("teams").select("*").eq("id", teamId).maybeSingle();
  if (!team) return { team: null, canView: false, canManage: false };

  const [member, { data: tm }] = await Promise.all([
    getCompanyMember(team.company_id, userId),
    supabase.from("team_members").select("role").eq("team_id", teamId).eq("user_id", userId).maybeSingle(),
  ]);
  const teamRole = member ? tm?.role || null : null; // left the company = no team access
  const managerHere =
    member?.role === "manager" && (!member.department_id || member.department_id === team.department_id);

  const canManage = isCompanyAdmin(member) || teamRole === "lead" || managerHere;
  const canView = canManage || !!teamRole || member?.role === "viewer";
  return { team, member, teamRole, canView, canManage };
};

// Which company tasks a member may see.
// { all: true } or { all: false, teamIds, projectIds } (+ always: tasks they
// created, are assigned to, review or watch — added by the caller's filter).
export const taskScope = async (member) => {
  if (!member) return { all: false, teamIds: [], projectIds: [] };
  if (["owner", "admin", "viewer"].includes(member.role)) return { all: true };

  const companyId = member.company_id;
  const [{ data: myTeams }, { data: extraProjects }] = await Promise.all([
    supabase.from("team_members").select("team_id, teams!inner(company_id)")
      .eq("user_id", member.user_id).eq("teams.company_id", companyId),
    supabase.from("project_members").select("project_id, projects!inner(company_id)")
      .eq("user_id", member.user_id).eq("projects.company_id", companyId),
  ]);

  // guests only ever see the projects they were added to
  if (member.role === "guest")
    return { all: false, teamIds: [], projectIds: (extraProjects || []).map((p) => p.project_id) };

  let teamIds = (myTeams || []).map((t) => t.team_id);
  if (member.role === "manager") {
    if (!member.department_id) return { all: true };
    const { data: deptTeams } = await supabase
      .from("teams").select("id").eq("company_id", companyId).eq("department_id", member.department_id);
    teamIds = [...new Set([...teamIds, ...(deptTeams || []).map((t) => t.id)])];
  }

  const { data: open } = await supabase
    .from("projects").select("id").eq("company_id", companyId).eq("visibility", "company");
  const projectIds = [
    ...new Set([...(open || []).map((p) => p.id), ...(extraProjects || []).map((p) => p.project_id)]),
  ];
  return { all: false, teamIds, projectIds };
};

// PostgREST filter for "tasks this member can see" (use with query.or(...))
export const scopeFilter = (scope, userId) => {
  const parts = [`user_id.eq.${userId}`, `assignee_id.eq.${userId}`, `reviewer_id.eq.${userId}`];
  if (scope.teamIds?.length) parts.push(`team_id.in.(${scope.teamIds.join(",")})`);
  if (scope.projectIds?.length) parts.push(`project_id.in.(${scope.projectIds.join(",")})`);
  return parts.join(",");
};

// Can this member see this one task? (task row with company_id/team_id/project_id)
export const scopeAllows = (scope, task, userId) =>
  scope.all ||
  task.user_id === userId ||
  task.assignee_id === userId ||
  task.reviewer_id === userId ||
  (task.team_id && scope.teamIds.includes(task.team_id)) ||
  (task.project_id && scope.projectIds.includes(task.project_id));

// Filter for "my own work" across workspaces: personal tasks I created + any
// company task assigned to me. Used by My Dones, streak, heatmap, personal goals.
export const myWorkFilter = (userId) => `and(user_id.eq.${userId},company_id.is.null),assignee_id.eq.${userId}`;

// What one user may do with one task row.
// { canView, canEdit, canDelete, canAssign, canComment, member }
export const taskAccess = async (task, userId) => {
  const none = { canView: false, canEdit: false, canDelete: false, canAssign: false, canComment: false, member: null };
  if (!task) return none;
  const involved = task.user_id === userId || task.assignee_id === userId || task.reviewer_id === userId;

  // personal task: creator only (the assignee is always the creator there)
  if (!task.company_id) {
    const mine = task.user_id === userId;
    return { ...none, canView: mine, canEdit: mine, canDelete: mine, canComment: mine };
  }

  const member = await getCompanyMember(task.company_id, userId);
  if (!member) {
    // former members still see what they were assigned? no — company data stays in the company
    return none;
  }
  const scope = await taskScope(member);
  if (!scopeAllows(scope, task, userId)) return { ...none, member };

  let canManage = isCompanyAdmin(member);
  if (!canManage && task.team_id) canManage = (await teamAccess(task.team_id, userId)).canManage;

  const role = member.role;
  const writer = role !== "viewer";
  return {
    canView: true,
    canEdit: writer && (canManage || involved || role !== "guest"),
    canDelete: canManage || task.user_id === userId,
    canAssign: writer && role !== "guest",
    canComment: writer,
    canManage,
    member,
  };
};
