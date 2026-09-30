-- OPTIONAL SECURITY HARDENING — read before running.
--
-- Supabase gives every project a public "anon" key. With Row Level Security
-- (RLS) OFF, anyone holding that key can read and change every table
-- directly — including users.password hashes — without going through this
-- backend.
--
-- This file turns RLS ON for every table and adds NO policies, so the anon
-- key can no longer read or write anything. The backend keeps working ONLY if
-- backend/.env SUPABASE_API is the **service_role** key (it bypasses RLS).
--
-- 1. Supabase dashboard → Project Settings → API → copy the service_role key
-- 2. Put it in backend/.env as SUPABASE_API=...  (never in the frontend)
-- 3. Restart the backend and check that login works
-- 4. Then run this file in the SQL Editor
--
-- To undo: alter table public.<name> disable row level security;

do $$
declare
  t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Check: every row should say true
select tablename, rowsecurity from pg_tables where schemaname = 'public' order by 1;
