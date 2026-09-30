-- Reference only: this table already exists in your database.
-- Saved from the old autcontroller.js so the schema lives with the code.

create table public.sessions (
  id uuid not null default gen_random_uuid (),
  user_id uuid null,
  access_token_jti character varying(100) not null,
  refresh_token_hash character varying(255) not null,
  access_token_expires_at timestamp without time zone not null,
  refresh_token_expires_at timestamp without time zone not null,
  device_fingerprint character varying(255) null,
  ip_address character varying(45) null,
  user_agent text null,
  country character varying(100) null,
  city character varying(100) null,
  is_active boolean null default true,
  revoked_at timestamp without time zone null,
  revocation_reason character varying(50) null,
  last_accessed_at timestamp without time zone null default now(),
  created_at timestamp without time zone null default now(),
  request_count integer null default 0,
  rate_limit_reset_at timestamp without time zone null default (now() + '01:00:00'::interval),
  refresh_token_used boolean null default false,
  constraint sessions_pkey primary key (id),
  constraint sessions_access_token_jti_key unique (access_token_jti),
  constraint sessions_user_id_fkey foreign KEY (user_id) references users (id) on delete CASCADE
) TABLESPACE pg_default;

create index IF not exists idx_sessions_user_active on public.sessions using btree (user_id, is_active) TABLESPACE pg_default;

create index IF not exists idx_sessions_jti on public.sessions using btree (access_token_jti) TABLESPACE pg_default;

create index IF not exists idx_sessions_refresh_hash on public.sessions using btree (refresh_token_hash) TABLESPACE pg_default;

create index IF not exists idx_sessions_refresh_used on public.sessions using btree (refresh_token_used) TABLESPACE pg_default;