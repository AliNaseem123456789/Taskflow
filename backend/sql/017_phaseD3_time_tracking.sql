-- Phase D step 3: time tracking
-- One row per stretch of work. A running timer has ended_at = null (at most one per person).
-- company_id null = personal time: only the person ever sees it.

create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  company_id uuid references public.companies (id) on delete cascade,
  task_id bigint references public.tasks (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  team_id uuid references public.teams (id) on delete set null,
  work_date date not null,
  started_at timestamptz,
  ended_at timestamptz,
  minutes integer check (minutes is null or (minutes >= 0 and minutes <= 1440)),
  note text,
  billable boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_time_user_date on public.time_entries (user_id, work_date);
create index if not exists idx_time_company_date on public.time_entries (company_id, work_date);
create index if not exists idx_time_task on public.time_entries (task_id);
create unique index if not exists uq_time_one_running on public.time_entries (user_id) where ended_at is null and started_at is not null;
