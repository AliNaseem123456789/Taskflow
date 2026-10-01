-- Phase B step 1: meetings, 1:1s and retros

create table if not exists public.meetings (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,
  team_id uuid references public.teams (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  title text not null,
  kind text not null default 'meeting' check (kind in ('meeting', 'one_on_one', 'retro', 'standup', 'review')),
  starts_at timestamptz not null,
  duration_min integer not null default 30 check (duration_min between 5 and 600),
  location text,                       -- room or video link
  agenda text not null default '',
  notes text not null default '',
  status text not null default 'scheduled' check (status in ('scheduled', 'done', 'cancelled')),
  private boolean not null default false, -- only attendees see it (1:1s always)
  series_id uuid,                      -- every meeting in a repeating series shares this
  recurrence text check (recurrence in ('weekly', 'biweekly', 'monthly')),
  reminded_at timestamptz,
  summary_sent_at timestamptz,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_meetings_company_time on public.meetings (company_id, starts_at);
create index if not exists idx_meetings_series on public.meetings (series_id, starts_at);
-- a series never gets two meetings at the same time (the repeat job relies on this)
create unique index if not exists uq_meetings_series_time on public.meetings (series_id, starts_at) where series_id is not null;

create table if not exists public.meeting_attendees (
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  user_id uuid not null references public.users (id) on delete cascade,
  response text not null default 'pending' check (response in ('pending', 'yes', 'no', 'maybe')),
  primary key (meeting_id, user_id)
);
create index if not exists idx_meeting_attendees_user on public.meeting_attendees (user_id);

-- Things captured in a meeting:
--   topic (agenda point / 1:1 talking point), decision, action (can become a task),
--   went_well / to_improve / idea (retro cards, with votes)
create table if not exists public.meeting_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  kind text not null check (kind in ('topic', 'decision', 'action', 'went_well', 'to_improve', 'idea')),
  text text not null,
  done boolean not null default false,
  assignee_id uuid references public.users (id) on delete set null,
  due_date date,
  task_id bigint references public.tasks (id) on delete set null,
  votes uuid[] not null default '{}',
  position integer not null default 0,
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists idx_meeting_items_meeting on public.meeting_items (meeting_id, kind, position);
