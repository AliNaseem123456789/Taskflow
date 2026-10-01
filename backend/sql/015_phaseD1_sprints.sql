-- Phase D step 1: sprints and estimates

-- How a team estimates, and how long its sprints usually are
alter table public.teams add column if not exists estimate_unit text not null default 'points'
  check (estimate_unit in ('points', 'hours'));
alter table public.teams add column if not exists sprint_length_days integer not null default 14
  check (sprint_length_days between 1 and 60);

create table if not exists public.sprints (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  team_id uuid not null references public.teams (id) on delete cascade,
  name text not null,
  goal text,
  start_date date not null,
  end_date date not null,
  status text not null default 'planned' check (status in ('planned', 'active', 'closed')),
  committed numeric(9,1),      -- estimate total when the sprint started
  completed numeric(9,1),      -- estimate total finished when it closed
  committed_tasks integer,
  completed_tasks integer,
  created_by uuid references public.users (id) on delete set null,
  started_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists idx_sprints_team on public.sprints (team_id, status, start_date);
-- at most one running sprint per team
create unique index if not exists uq_sprints_one_active on public.sprints (team_id) where status = 'active';

alter table public.tasks add column if not exists sprint_id uuid references public.sprints (id) on delete set null;
alter table public.tasks add column if not exists estimate numeric(7,1) check (estimate is null or estimate >= 0);
alter table public.tasks add column if not exists start_date date;   -- used by the timeline (Phase D step 2)
create index if not exists idx_tasks_sprint on public.tasks (sprint_id);
