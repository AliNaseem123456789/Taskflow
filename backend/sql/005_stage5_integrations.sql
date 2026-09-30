-- Stage 5: integrations (SMS, Slack, browser push, Google Calendar, GitHub, Jira)
-- Run once in the Supabase SQL Editor. Safe to run again.

-- Where to reach each user
alter table public.users add column if not exists phone text;          -- +923001234567 (for SMS)
alter table public.users add column if not exists slack_webhook text;  -- encrypted Slack webhook URL

-- Team digest can also post to a Slack channel
alter table public.teams add column if not exists slack_webhook text;  -- encrypted

-- Connected accounts (Google, GitHub, Jira). Secrets inside `data` are encrypted.
create table if not exists public.integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  provider text not null check (provider in ('google', 'github', 'jira')),
  data jsonb not null default '{}'::jsonb,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  unique (user_id, provider)
);

-- Browser push subscriptions (one per browser/device)
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists idx_push_user on public.push_subscriptions (user_id);

-- Imported tasks remember where they came from, so a sync never duplicates them
alter table public.tasks add column if not exists external_id text;     -- github:pr:owner/repo#12, jira:ABC-1
alter table public.tasks add column if not exists external_url text;
alter table public.tasks add column if not exists google_event_id text; -- Calendar event for the due date
create unique index if not exists tasks_user_external_id
  on public.tasks (user_id, external_id) where external_id is not null;

-- Small key/value store (e.g. browser-push keys generated on first start)
create table if not exists public.app_config (
  key text primary key,
  value text not null,
  created_at timestamptz not null default now()
);

-- Log SMS / Slack / push sends next to emails
alter table public.email_logs add column if not exists channel text not null default 'email';
