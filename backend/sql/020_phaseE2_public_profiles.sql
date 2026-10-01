-- Phase E step 2: public profiles, public company pages, discovery, public job posts
-- Everything here is opt-in: nothing is public until the person (or company admin) turns it on.
-- Personal tasks and dones never appear on a profile.

create table if not exists public.public_profiles (
  user_id uuid primary key references public.users (id) on delete cascade,
  handle text not null unique check (handle ~ '^[a-z0-9][a-z0-9-]{2,29}$'),
  is_public boolean not null default false,
  headline text,
  bio text,
  location text,
  genres text[] not null default '{}',     -- kinds of work: software, design, marketing…
  skills text[] not null default '{}',
  links jsonb not null default '[]'::jsonb,     -- [{ label, url }]
  showcase jsonb not null default '[]'::jsonb,  -- [{ title, description, url }]
  open_to_work boolean not null default false,
  open_to text[] not null default '{}',    -- full_time, part_time, project, gig
  show_companies boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_profiles_public on public.public_profiles (is_public);
create index if not exists idx_profiles_skills on public.public_profiles using gin (skills);
create index if not exists idx_profiles_genres on public.public_profiles using gin (genres);

-- A company's public page
alter table public.companies add column if not exists is_public boolean not null default false;
alter table public.companies add column if not exists tagline text;
alter table public.companies add column if not exists about text;
alter table public.companies add column if not exists website text;
alter table public.companies add column if not exists location text;

-- Roles can be posted publicly (shown on the company page; anyone with a profile can apply)
alter table public.job_postings add column if not exists visibility text not null default 'internal'
  check (visibility in ('internal', 'public'));
alter table public.job_applications add column if not exists external boolean not null default false;

-- Invites sent from someone's public profile keep their email hidden from the company
alter table public.company_invites add column if not exists via_profile boolean not null default false;
