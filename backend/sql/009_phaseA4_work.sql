-- Phase A step 4: richer company tasks
-- reviewer + watchers, subtasks, checklists, "blocked by" links,
-- per-project columns (from the company's kind of work), start/finish times.

-- 1. Project columns. category says how a column counts: todo / in_progress / done
create table if not exists public.project_statuses (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  category text not null check (category in ('todo', 'in_progress', 'done')),
  color text not null default '#6b7280',
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_project_statuses_project on public.project_statuses (project_id, position);

-- 2. New task columns
alter table public.tasks add column if not exists reviewer_id uuid references public.users (id) on delete set null;
alter table public.tasks add column if not exists parent_task_id bigint references public.tasks (id) on delete cascade;
alter table public.tasks add column if not exists status_id uuid references public.project_statuses (id) on delete set null;
alter table public.tasks add column if not exists started_at timestamptz;
alter table public.tasks add column if not exists completed_at timestamptz;
create index if not exists idx_tasks_parent on public.tasks (parent_task_id);
create index if not exists idx_tasks_reviewer on public.tasks (reviewer_id);
create index if not exists idx_tasks_status_id on public.tasks (status_id);

-- 3. Watchers: people who get told when a task changes
create table if not exists public.task_watchers (
  task_id bigint not null references public.tasks (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (task_id, user_id)
);
create index if not exists idx_task_watchers_user on public.task_watchers (user_id);

-- 4. Checklist inside a task
create table if not exists public.task_checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id bigint not null references public.tasks (id) on delete cascade,
  title text not null,
  done boolean not null default false,
  position integer not null default 0,
  done_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_task_checklist_task on public.task_checklist_items (task_id, position);

-- 5. "This task is blocked by that one"
create table if not exists public.task_dependencies (
  task_id bigint not null references public.tasks (id) on delete cascade,
  blocked_by_id bigint not null references public.tasks (id) on delete cascade,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (task_id, blocked_by_id),
  check (task_id <> blocked_by_id)
);
create index if not exists idx_task_dependencies_blocker on public.task_dependencies (blocked_by_id);

-- 6. Stamp when work started and finished (for cycle time reports later)
create or replace function public.task_status_times() returns trigger
language plpgsql as $$
declare
  cat text;
begin
  if new.status_id is not null then
    select category into cat from public.project_statuses where id = new.status_id;
  end if;
  if cat is null then
    cat := case new.status when 'Done' then 'done' else 'in_progress' end;
  end if;

  if cat in ('in_progress', 'done') and new.started_at is null then
    new.started_at := now();
  end if;
  if cat = 'done' then
    if tg_op = 'UPDATE' and old.completed_at is not null and old.status = 'Done' then
      new.completed_at := old.completed_at;   -- already finished: keep the first time
    else
      new.completed_at := coalesce(new.completed_at, now());
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end $$;

drop trigger if exists trg_task_status_times on public.tasks;
create trigger trg_task_status_times
  before insert or update of status, status_id on public.tasks
  for each row execute function public.task_status_times();

-- existing finished tasks: best guess from when they were last touched
update public.tasks set completed_at = coalesce(updated_at, created_at)
  where status = 'Done' and completed_at is null;
