-- Phase B step 3: time off (with approval), company holidays, workload

create table if not exists public.time_off (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  kind text not null default 'vacation' check (kind in ('vacation', 'sick', 'personal', 'other')),
  start_date date not null,
  end_date date not null,
  half_day boolean not null default false,
  note text,                            -- only the person and approvers see it
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  decided_by uuid references public.users (id) on delete set null,
  decided_at timestamptz,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists idx_time_off_company_dates on public.time_off (company_id, start_date, end_date);
create index if not exists idx_time_off_user on public.time_off (user_id, status);

create table if not exists public.company_holidays (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  date date not null,
  name text not null,
  created_at timestamptz not null default now(),
  unique (company_id, date)
);
