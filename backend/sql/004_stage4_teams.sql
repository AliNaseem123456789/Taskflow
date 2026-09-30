-- Stage 4: team features
-- Run once in the Supabase SQL Editor. Safe to run again.

-- 1. Invite people by email link
create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  email text not null,
  token_hash text not null unique,
  invited_by uuid references public.users (id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_team_invites_team on public.team_invites (team_id);

-- 2. Automatic daily team digest (set by an admin)
alter table public.teams add column if not exists digest_enabled boolean not null default false;
alter table public.teams add column if not exists digest_time text not null default '06:00 PM';
alter table public.teams add column if not exists digest_days text[] not null default array['Mon','Tue','Wed','Thu','Fri'];
alter table public.teams add column if not exists digest_timezone text not null default 'UTC';
alter table public.teams add column if not exists digest_last_sent timestamptz;

-- 3. Projects: group tasks from any team member
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  name text not null,
  description text,
  color text not null default '#3b82f6',
  archived boolean not null default false,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_projects_team on public.projects (team_id);

alter table public.tasks add column if not exists project_id uuid
  references public.projects (id) on delete set null;
create index if not exists idx_tasks_project on public.tasks (project_id);

-- team goals can count only one project's tasks
alter table public.goals add column if not exists project_id uuid
  references public.projects (id) on delete set null;

-- 4. Daily standups: yesterday / today / blockers
create table if not exists public.standups (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  date date not null,
  yesterday text,
  today text,
  blockers text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (team_id, user_id, date)
);
create index if not exists idx_standups_team_date on public.standups (team_id, date);
