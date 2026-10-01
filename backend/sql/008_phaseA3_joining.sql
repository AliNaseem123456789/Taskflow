-- Phase A step 3: joining a company (invites, email-domain join, guests, onboarding)

-- 1. Invite someone to a company by email, with a role, and optionally a team / project / onboarding checklist
create table if not exists public.company_invites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  email text not null,
  role text not null default 'member' check (role in ('admin', 'manager', 'member', 'guest', 'viewer')),
  team_id uuid references public.teams (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  template_id uuid,
  token_hash text not null unique,
  invited_by uuid references public.users (id) on delete set null,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_company_invites_company on public.company_invites (company_id);

-- 2. "Ask to join" when the company's email-domain setting is 'request'
create table if not exists public.join_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  message text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'denied')),
  decided_by uuid references public.users (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
-- one open request per person per company
create unique index if not exists uq_join_requests_pending
  on public.join_requests (company_id, user_id) where status = 'pending';

-- 3. Onboarding checklists: a list of tasks given to a new joiner
create table if not exists public.onboarding_templates (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  name text not null,
  items jsonb not null default '[]'::jsonb,  -- [{ "title": "...", "days": 0 }]
  is_default boolean not null default false,  -- given automatically to everyone who joins
  team_id uuid references public.teams (id) on delete set null,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_onboarding_templates_company on public.onboarding_templates (company_id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'company_invites_template_id_fkey') then
    alter table public.company_invites add constraint company_invites_template_id_fkey
      foreign key (template_id) references public.onboarding_templates (id) on delete set null;
  end if;
end $$;
