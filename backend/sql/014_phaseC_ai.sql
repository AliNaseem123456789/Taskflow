-- Phase C: AI features. Every AI call is recorded here (for daily limits and the
-- company's usage page). The AI service never touches the database itself.
create table if not exists public.ai_usage (
  id bigint generated always as identity primary key,
  company_id uuid references public.companies (id) on delete cascade, -- null = Personal
  user_id uuid not null references public.users (id) on delete cascade,
  feature text not null,
  model text,
  tokens_in integer not null default 0,
  tokens_out integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists idx_ai_usage_user_day on public.ai_usage (user_id, created_at);
create index if not exists idx_ai_usage_company_day on public.ai_usage (company_id, created_at);
