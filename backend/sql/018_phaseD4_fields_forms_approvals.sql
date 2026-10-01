-- Phase D step 4: custom fields on project tasks, request forms, approvals

-- Fields a project adds to its tasks (e.g. "Customer", "Severity", "Ready for QA")
create table if not exists public.project_fields (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('text', 'number', 'select', 'date', 'person', 'checkbox')),
  options jsonb not null default '[]'::jsonb,   -- choices for 'select'
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_project_fields_project on public.project_fields (project_id, position);

create table if not exists public.task_field_values (
  task_id bigint not null references public.tasks (id) on delete cascade,
  field_id uuid not null references public.project_fields (id) on delete cascade,
  value jsonb,
  updated_at timestamptz not null default now(),
  primary key (task_id, field_id)
);

-- Request forms: anyone in the company fills one in, and it becomes a task in a project
create table if not exists public.request_forms (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  project_id uuid not null references public.projects (id) on delete cascade,
  name text not null,
  description text,
  questions jsonb not null default '[]'::jsonb, -- [{ id, label, kind, required, options, maps_to }]
  default_priority text not null default 'medium',
  assignee_id uuid references public.users (id) on delete set null,
  is_open boolean not null default true,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_request_forms_company on public.request_forms (company_id);

create table if not exists public.request_submissions (
  id uuid primary key default gen_random_uuid(),
  form_id uuid not null references public.request_forms (id) on delete cascade,
  task_id bigint references public.tasks (id) on delete set null,
  submitted_by uuid references public.users (id) on delete set null,
  answers jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists idx_request_submissions_form on public.request_submissions (form_id, created_at);

-- Approvals on tasks: ask someone to approve; they approve or reject with a comment
create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  task_id bigint not null references public.tasks (id) on delete cascade,
  company_id uuid not null references public.companies (id) on delete cascade,
  requested_by uuid references public.users (id) on delete set null,
  approver_id uuid not null references public.users (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'cancelled')),
  note text,
  comment text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_approvals_task on public.approvals (task_id);
create index if not exists idx_approvals_approver on public.approvals (approver_id, status);
-- one open request per approver per task
create unique index if not exists uq_approvals_open on public.approvals (task_id, approver_id) where status = 'pending';
