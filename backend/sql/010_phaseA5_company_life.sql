-- Phase A step 5: company life (transfers between teams, announcements, offboarding)

-- 1. Moving someone to another team: asked for, approved, then done on a date
create table if not exists public.transfers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  from_team_id uuid references public.teams (id) on delete set null,
  to_team_id uuid not null references public.teams (id) on delete cascade,
  to_department_id uuid references public.departments (id) on delete set null,
  to_manager_id uuid references public.users (id) on delete set null,
  effective_date date not null,
  task_plan text not null default 'keep' check (task_plan in ('keep', 'reassign')),
  reassign_to uuid references public.users (id) on delete set null,
  note text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'cancelled', 'completed')),
  requested_by uuid references public.users (id) on delete set null,
  decided_by uuid references public.users (id) on delete set null,
  decided_at timestamptz,
  completed_at timestamptz,
  tasks_moved integer,
  created_at timestamptz not null default now()
);
create index if not exists idx_transfers_company on public.transfers (company_id, status);
create index if not exists idx_transfers_due on public.transfers (status, effective_date);
-- one open transfer per person at a time
create unique index if not exists uq_transfers_open
  on public.transfers (company_id, user_id) where status in ('pending', 'approved');

-- 2. Announcements, with who has read them
create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  author_id uuid references public.users (id) on delete set null,
  title text not null,
  body text not null default '',
  audience text not null default 'company' check (audience in ('company', 'team', 'department')),
  team_id uuid references public.teams (id) on delete cascade,
  department_id uuid references public.departments (id) on delete cascade,
  pinned boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_announcements_company on public.announcements (company_id, created_at desc);

create table if not exists public.announcement_reads (
  announcement_id uuid not null references public.announcements (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (announcement_id, user_id)
);
