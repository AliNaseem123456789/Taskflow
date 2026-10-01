-- Phase A · step 1: companies, members, roles, workspace columns
-- Run once in the Supabase SQL Editor. Safe to run again.
-- Every existing team becomes a company of the same name (see the end).

-- 1. Companies (workspaces). One person can be in many.
create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  work_type text not null default 'general',
  email_domain text,
  domain_join text not null default 'off' check (domain_join in ('off', 'request', 'auto')),
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- 2. People in a company. role = what they may do; job_title/level = labels only.
create table if not exists public.company_members (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  role text not null default 'member'
    check (role in ('owner', 'admin', 'manager', 'member', 'guest', 'viewer')),
  job_title text,
  level text,
  department_id uuid,                          -- linked to departments in step 2
  manager_id uuid references public.users (id) on delete set null,
  skills text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'left')),
  joined_at timestamptz not null default now(),
  left_at timestamptz,
  unique (company_id, user_id)
);
create index if not exists idx_company_members_user on public.company_members (user_id, status);

-- Departments group teams (managed in step 2; created now so teams can point at them)
create table if not exists public.departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  parent_id uuid references public.departments (id) on delete set null,
  head_user_id uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_departments_company on public.departments (company_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'company_members_department_id_fkey') then
    alter table public.company_members add constraint company_members_department_id_fkey
      foreign key (department_id) references public.departments (id) on delete set null;
  end if;
end $$;

-- 3. Extra access to one project (guests, and people outside the project's team)
create table if not exists public.project_members (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  access text not null default 'edit' check (access in ('edit', 'view')),
  added_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (project_id, user_id)
);

-- audit_logs already exists in your database; this only creates it if missing
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users (id) on delete set null,
  session_id uuid references public.sessions (id) on delete set null,
  action varchar not null,
  resource_type varchar,
  resource_id uuid,
  details jsonb,
  ip_address varchar,
  user_agent text,
  status varchar,
  error_message text,
  created_at timestamp default now()
);

-- 4. Workspace columns
alter table public.teams add column if not exists company_id uuid references public.companies (id) on delete cascade;
alter table public.teams add column if not exists department_id uuid references public.departments (id) on delete set null;
alter table public.teams add column if not exists parent_team_id uuid references public.teams (id) on delete set null;
alter table public.projects add column if not exists company_id uuid references public.companies (id) on delete cascade;
alter table public.projects add column if not exists visibility text not null default 'team';
alter table public.projects add column if not exists work_type text not null default 'general';
alter table public.tasks add column if not exists company_id uuid references public.companies (id) on delete cascade;
alter table public.tasks add column if not exists team_id uuid references public.teams (id) on delete set null;
alter table public.tasks add column if not exists assignee_id uuid references public.users (id) on delete set null;
alter table public.goals add column if not exists company_id uuid references public.companies (id) on delete cascade;
alter table public.standups add column if not exists company_id uuid references public.companies (id) on delete cascade;
alter table public.notifications add column if not exists company_id uuid references public.companies (id) on delete cascade;
alter table public.audit_logs add column if not exists company_id uuid references public.companies (id) on delete cascade;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'projects_visibility_check') then
    alter table public.projects add constraint projects_visibility_check check (visibility in ('team', 'company'));
  end if;
end $$;

create index if not exists idx_tasks_company on public.tasks (company_id, date_logged);
create index if not exists idx_tasks_assignee on public.tasks (assignee_id, date_logged);
create index if not exists idx_tasks_team on public.tasks (team_id, date_logged);
create index if not exists idx_audit_company on public.audit_logs (company_id, created_at desc);

-- 5. Team roles are now lead / member (company admins manage every team)
alter table public.team_members drop constraint if exists team_members_role_check;
update public.team_members set role = 'lead' where role = 'admin';
alter table public.team_members add constraint team_members_role_check check (role in ('lead', 'member'));

-- 6. Move existing data: each team without a company becomes one
do $$
declare
  t record;
  cid uuid;
begin
  for t in select * from public.teams where company_id is null loop
    insert into public.companies (name, slug, created_by)
    values (t.name,
            trim(both '-' from regexp_replace(lower(t.name), '[^a-z0-9]+', '-', 'g')) || '-' || substr(t.id::text, 1, 6),
            t.owner_id)
    returning id into cid;

    update public.teams set company_id = cid where id = t.id;

    insert into public.company_members (company_id, user_id, role)
    select cid, tm.user_id,
           case when tm.user_id = t.owner_id then 'owner'
                when tm.role = 'lead' then 'admin'
                else 'member' end
    from public.team_members tm
    where tm.team_id = t.id
    on conflict (company_id, user_id) do nothing;

    -- the owner is always a member, even if they left the team list
    insert into public.company_members (company_id, user_id, role)
    values (cid, t.owner_id, 'owner')
    on conflict (company_id, user_id) do update set role = 'owner';
  end loop;
end $$;

update public.projects p set company_id = t.company_id
from public.teams t where p.team_id = t.id and p.company_id is null;

update public.goals g set company_id = t.company_id
from public.teams t where g.team_id = t.id and g.company_id is null;

update public.standups s set company_id = t.company_id
from public.teams t where s.team_id = t.id and s.company_id is null;

-- tasks already in a team project become company tasks, assigned to whoever logged them
update public.tasks k set company_id = p.company_id, team_id = p.team_id,
       assignee_id = coalesce(k.assignee_id, k.user_id)
from public.projects p where k.project_id = p.id and k.company_id is null;
