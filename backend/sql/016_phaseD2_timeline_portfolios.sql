-- Phase D step 2: project timeline, milestones, portfolios

alter table public.projects add column if not exists start_date date;
alter table public.projects add column if not exists target_date date;

create table if not exists public.milestones (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  date date not null,
  done boolean not null default false,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_milestones_project on public.milestones (project_id, date);

-- A portfolio groups projects (e.g. "Q4 launches") to follow them together
create table if not exists public.portfolios (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  description text,
  owner_id uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_portfolios_company on public.portfolios (company_id);

create table if not exists public.portfolio_projects (
  portfolio_id uuid not null references public.portfolios (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (portfolio_id, project_id)
);
