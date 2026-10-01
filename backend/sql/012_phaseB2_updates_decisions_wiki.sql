-- Phase B step 2: project status updates, decision log, wiki pages

-- 1. "How is this project doing?" posted by its lead, with a snapshot of the numbers
create table if not exists public.project_updates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  author_id uuid references public.users (id) on delete set null,
  health text not null check (health in ('on_track', 'at_risk', 'off_track')),
  summary text not null,
  highlights text,
  risks text,
  next_steps text,
  stats jsonb not null default '{}'::jsonb,   -- done this week, open, overdue at the time
  created_at timestamptz not null default now()
);
create index if not exists idx_project_updates_project on public.project_updates (project_id, created_at desc);
create index if not exists idx_project_updates_company on public.project_updates (company_id, created_at desc);

-- 2. Decision log: what was decided, why, by whom
create table if not exists public.decisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  team_id uuid references public.teams (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  meeting_id uuid references public.meetings (id) on delete set null,
  meeting_item_id uuid unique references public.meeting_items (id) on delete set null,
  title text not null,
  context text,
  status text not null default 'decided' check (status in ('proposed', 'decided', 'reversed')),
  decided_on date not null default current_date,
  owner_id uuid references public.users (id) on delete set null,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_decisions_company on public.decisions (company_id, decided_on desc);

-- 3. Wiki: pages for the whole company or one team, nested, with history
create table if not exists public.wiki_pages (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  parent_id uuid references public.wiki_pages (id) on delete set null,
  title text not null,
  body text not null default '',
  created_by uuid references public.users (id) on delete set null,
  updated_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_wiki_pages_company on public.wiki_pages (company_id, team_id);

create table if not exists public.wiki_page_versions (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.wiki_pages (id) on delete cascade,
  title text not null,
  body text not null,
  edited_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_wiki_versions_page on public.wiki_page_versions (page_id, created_at desc);
