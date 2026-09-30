-- Stage 3: core task features
-- Run once in the Supabase SQL Editor. Safe to run again.

-- 1. New task fields
alter table public.tasks add column if not exists due_date date;
alter table public.tasks add column if not exists priority text not null default 'medium';
alter table public.tasks add column if not exists blocker text;                 -- "What's blocking you?"
alter table public.tasks add column if not exists recurrence text;              -- null | daily | weekdays | weekly | monthly
alter table public.tasks add column if not exists recurrence_parent_id bigint
  references public.tasks (id) on delete set null;                             -- copies point at the original
alter table public.tasks add column if not exists position integer not null default 0; -- order on the board

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'tasks_priority_check') then
    alter table public.tasks add constraint tasks_priority_check
      check (priority in ('low', 'medium', 'high', 'urgent'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tasks_recurrence_check') then
    alter table public.tasks add constraint tasks_recurrence_check
      check (recurrence is null or recurrence in ('daily', 'weekdays', 'weekly', 'monthly'));
  end if;
end $$;

-- One copy per recurring task per day (stops the nightly job making duplicates)
create unique index if not exists tasks_recurrence_once_per_day
  on public.tasks (recurrence_parent_id, date_logged)
  where recurrence_parent_id is not null;

create index if not exists idx_tasks_recurring on public.tasks (recurrence) where recurrence is not null;
create index if not exists idx_tasks_user_status on public.tasks (user_id, status);

-- 2. Goals ("Finish 20 tasks this month", optionally only tasks with a tag)
create table if not exists public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  title text not null,
  period text not null check (period in ('week', 'month')),
  target integer not null check (target > 0),
  tag_id uuid references public.tags (id) on delete set null,
  created_at timestamptz not null default now()
);
-- team goals (stage 4) use team_id; personal goals leave it empty
alter table public.goals add column if not exists team_id uuid references public.teams (id) on delete cascade;
create index if not exists idx_goals_user on public.goals (user_id);
create index if not exists idx_goals_team on public.goals (team_id);

-- 3. In-app notifications (@mentions, comments on your tasks, ...)
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,  -- who sees it
  actor_id uuid references public.users (id) on delete set null,         -- who caused it
  type text not null,                                                     -- mention | comment | ...
  task_id bigint references public.tasks (id) on delete cascade,
  message text not null,
  link text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_user_unread
  on public.notifications (user_id, created_at desc) where read_at is null;
