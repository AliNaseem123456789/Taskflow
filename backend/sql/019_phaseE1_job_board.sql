-- Phase E step 1: internal job board
-- Open roles inside a company; members apply, and a hire becomes a team transfer.
-- Applications are confidential: only the applicant, the hiring side and admins see them.

create table if not exists public.job_postings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  team_id uuid references public.teams (id) on delete set null,
  title text not null,
  description text,
  skills text[] not null default '{}',
  level text,
  kind text not null default 'full_time' check (kind in ('full_time', 'part_time', 'project', 'gig')),
  location text,
  openings integer not null default 1 check (openings between 1 and 50),
  status text not null default 'open' check (status in ('open', 'closed', 'filled')),
  hiring_manager_id uuid references public.users (id) on delete set null,
  posted_by uuid references public.users (id) on delete set null,
  closes_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_job_postings_company on public.job_postings (company_id, status);

create table if not exists public.job_applications (
  id uuid primary key default gen_random_uuid(),
  posting_id uuid not null references public.job_postings (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  note text,
  status text not null default 'applied'
    check (status in ('applied', 'reviewing', 'interview', 'offer', 'hired', 'declined', 'withdrawn')),
  tell_manager boolean not null default false,
  hiring_note text,                       -- private to the hiring side
  transfer_id uuid references public.transfers (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (posting_id, user_id)
);
create index if not exists idx_job_applications_user on public.job_applications (user_id);
