-- Phase A step 2: company structure (departments, sub-teams, org chart)
-- The tables and columns came in 006; this adds the rules and indexes.

-- one department name per company (case-insensitive)
create unique index if not exists uq_departments_company_name
  on public.departments (company_id, lower(name));

create index if not exists idx_teams_company_department on public.teams (company_id, department_id);
create index if not exists idx_teams_parent on public.teams (parent_team_id);
create index if not exists idx_company_members_department on public.company_members (department_id);
create index if not exists idx_company_members_manager on public.company_members (company_id, manager_id);

-- skills search ("who knows figma?")
create index if not exists idx_company_members_skills on public.company_members using gin (skills);
