-- Stage 2: account features (edit profile, verify email, reset password)
-- Run once in the Supabase SQL Editor. Safe to run again.

-- Email verification. Everyone who already has an account counts as verified;
-- only new signups get the "verify your email" banner.
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'users' and column_name = 'email_verified'
  ) then
    alter table public.users add column email_verified boolean not null default false;
    update public.users set email_verified = true;
  end if;
end $$;

-- One-time links for "verify email" and "reset password".
-- Only a hash of the token is stored.
create table if not exists public.auth_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete cascade,
  type text not null check (type in ('verify_email', 'reset_password')),
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_auth_tokens_user_type on public.auth_tokens (user_id, type);
