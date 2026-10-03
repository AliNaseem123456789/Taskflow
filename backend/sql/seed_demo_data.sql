-- ════════════════════════════════════════════════════════════════════════════
-- Demo data for Taskflow. Run in the Supabase SQL Editor AFTER migrations 001–020.
--
-- Creates a demo company "Karachi Code" with 7 people, 4 teams, projects,
-- sprints, tasks (with subtasks, checklists, comments, dependencies), meetings,
-- announcements, project updates, decisions, wiki, time off, time tracking,
-- custom fields, a request form, approvals, job board, public profiles,
-- portfolios, goals and ~60 days of personal history for each demo person.
--
-- Every demo person can log in with password:  demo1234
--   ayesha@demo.taskflow.dev  (owner)        bilal@demo.taskflow.dev  (manager)
--   sara@demo.taskflow.dev    (Web lead)     hamza@demo.taskflow.dev  (Web)
--   zainab@demo.taskflow.dev  (Mobile lead)  usman@demo.taskflow.dev  (Data)
--   fatima@demo.taskflow.dev  (Design lead)
--
-- To see the demo company from YOUR OWN account too, put your login email
-- on the `my_email` line below (it must already be signed up). You'll be an
-- admin of the demo company with some tasks assigned. Your personal tasks are
-- never touched.
--
-- Safe to run again: it first deletes the previous demo company and demo users
-- (and everything that belongs to them), then creates everything fresh,
-- with dates relative to today.
-- To remove the demo completely, run only the "clean up" part at the top.
-- ════════════════════════════════════════════════════════════════════════════

-- ── clean up the previous demo ──────────────────────────────────────────────
delete from public.companies where slug = 'karachi-code-demo';
delete from public.users where email like '%@demo.taskflow.dev';

-- ── helper: make a task, return its id (lives only for this session) ───────
create or replace function pg_temp.demo_task(
  p_user uuid, p_title text, p_status text, p_logged date,
  p_company uuid default null, p_team uuid default null, p_project uuid default null,
  p_assignee uuid default null, p_priority text default 'medium', p_due date default null,
  p_desc text default null, p_estimate numeric default null, p_start date default null,
  p_sprint uuid default null, p_parent bigint default null, p_reviewer uuid default null
) returns bigint language plpgsql as $f$
declare new_id bigint;
begin
  insert into public.tasks (user_id, title, description, status, date_logged, created_at, updated_at,
    due_date, priority, company_id, team_id, project_id, assignee_id, reviewer_id, parent_task_id,
    started_at, completed_at, sprint_id, estimate, start_date)
  values (p_user, p_title, p_desc, p_status, p_logged,
    p_logged + time '09:30', p_logged + time '09:30',
    p_due, p_priority, p_company, p_team, p_project, p_assignee, p_reviewer, p_parent,
    case when p_status <> 'Doing' or p_company is not null then (p_logged + time '10:00') at time zone 'UTC' end,
    case when p_status = 'Done' then (least(coalesce(p_due, p_logged + 3), current_date) + time '16:00') at time zone 'UTC' end,
    p_sprint, p_estimate, p_start)
  returning id into new_id;
  return new_id;
end $f$;

do $seed$
declare
  my_email text := 'you@example.com';   -- ← put your own login email here (optional)
  pw text := '$2b$10$1cHRo6chxFz41xTmG5Ll9eBFYTxnT8rCvjs8G4o1Eg/qJgmA6xH5G'; -- "demo1234"
  d date := current_date;
  me uuid;
  ayesha uuid; bilal uuid; sara uuid; hamza uuid; zainab uuid; usman uuid; fatima uuid;
  co uuid; eng uuid; des uuid;
  t_web uuid; t_mob uuid; t_data uuid; t_des uuid;
  p_portal uuid; p_offline uuid; p_wh uuid; p_brand uuid;
  sp_old uuid; sp_now uuid; sp_next uuid;
  f_sev uuid; f_cust uuid; f_qa uuid;
  m1 uuid; m2 uuid; m3 uuid; m4 uuid;
  job1 uuid; job2 uuid; job3 uuid; pf uuid; frm uuid; w1 uuid;
  t1 bigint; t2 bigint; t3 bigint; t4 bigint; t5 bigint; t6 bigint; t7 bigint; t8 bigint;
  r record; i int; uid uuid; st text; titles text[];
begin
  perform setseed(0.42);

  -- ── people ────────────────────────────────────────────────────────────────
  insert into public.users (email, password, name, timezone, email_verified, created_at) values
    ('ayesha@demo.taskflow.dev', pw, 'Ayesha Khan', 'Asia/Karachi', true, now() - interval '200 days') returning id into ayesha;
  insert into public.users (email, password, name, timezone, email_verified, created_at) values
    ('bilal@demo.taskflow.dev', pw, 'Bilal Ahmed', 'Asia/Karachi', true, now() - interval '190 days') returning id into bilal;
  insert into public.users (email, password, name, timezone, email_verified, created_at) values
    ('sara@demo.taskflow.dev', pw, 'Sara Malik', 'Asia/Karachi', true, now() - interval '180 days') returning id into sara;
  insert into public.users (email, password, name, timezone, email_verified, created_at) values
    ('hamza@demo.taskflow.dev', pw, 'Hamza Raza', 'Asia/Karachi', true, now() - interval '150 days') returning id into hamza;
  insert into public.users (email, password, name, timezone, email_verified, created_at) values
    ('zainab@demo.taskflow.dev', pw, 'Zainab Ali', 'Asia/Karachi', true, now() - interval '170 days') returning id into zainab;
  insert into public.users (email, password, name, timezone, email_verified, created_at) values
    ('usman@demo.taskflow.dev', pw, 'Usman Tariq', 'Asia/Karachi', true, now() - interval '120 days') returning id into usman;
  insert into public.users (email, password, name, timezone, email_verified, created_at) values
    ('fatima@demo.taskflow.dev', pw, 'Fatima Noor', 'Asia/Karachi', true, now() - interval '160 days') returning id into fatima;
  select id into me from public.users where lower(email) = lower(my_email);

  -- ── company, departments, members ─────────────────────────────────────────
  insert into public.companies (name, slug, work_type, created_by, is_public, tagline, about, website, location, created_at)
  values ('Karachi Code', 'karachi-code-demo', 'software', ayesha, true,
    'We build calm, reliable software for growing businesses',
    E'Karachi Code is a small product studio.\n\n- Remote-first, with an office in Karachi\n- Four teams: Web, Mobile, Data and Design\n- We ship every two weeks and write things down',
    'https://example.com', 'Karachi, Pakistan', now() - interval '200 days')
  returning id into co;

  insert into public.departments (company_id, name, head_user_id) values (co, 'Engineering', bilal) returning id into eng;
  insert into public.departments (company_id, name, head_user_id) values (co, 'Design', fatima) returning id into des;

  insert into public.company_members (company_id, user_id, role, job_title, level, department_id, manager_id, skills, joined_at) values
    (co, ayesha, 'owner',   'CEO',                     null, null, null, '{strategy,product,hiring}', now() - interval '200 days'),
    (co, bilal,  'manager', 'Head of Engineering',     'L6', eng, ayesha, '{node,architecture,postgres}', now() - interval '190 days'),
    (co, sara,   'member',  'Senior Frontend Engineer','L4', eng, bilal, '{react,typescript,css,testing}', now() - interval '180 days'),
    (co, hamza,  'member',  'Frontend Engineer',       'L2', eng, sara,  '{react,css,javascript}', now() - interval '150 days'),
    (co, zainab, 'member',  'Mobile Lead',             'L4', eng, bilal, '{react native,kotlin,swift}', now() - interval '170 days'),
    (co, usman,  'member',  'Data Engineer',           'L3', eng, bilal, '{sql,python,airflow,dbt}', now() - interval '120 days'),
    (co, fatima, 'member',  'Design Lead',             'L4', des, ayesha, '{figma,user research,design systems}', now() - interval '160 days');
  if me is not null then
    insert into public.company_members (company_id, user_id, role, job_title, department_id, manager_id, skills)
    values (co, me, 'admin', 'Product Manager', eng, ayesha, '{product,sql,roadmaps}');
  end if;

  -- ── teams ─────────────────────────────────────────────────────────────────
  insert into public.teams (name, owner_id, company_id, department_id, estimate_unit, sprint_length_days, created_at)
    values ('Web', sara, co, eng, 'points', 14, now() - interval '180 days') returning id into t_web;
  insert into public.teams (name, owner_id, company_id, department_id, estimate_unit, created_at)
    values ('Mobile', zainab, co, eng, 'points', now() - interval '170 days') returning id into t_mob;
  insert into public.teams (name, owner_id, company_id, department_id, estimate_unit, created_at)
    values ('Data', usman, co, eng, 'hours', now() - interval '120 days') returning id into t_data;
  insert into public.teams (name, owner_id, company_id, department_id, created_at)
    values ('Design', fatima, co, des, now() - interval '160 days') returning id into t_des;

  insert into public.team_members (team_id, user_id, role) values
    (t_web, sara, 'lead'), (t_web, hamza, 'member'), (t_web, fatima, 'member'),
    (t_mob, zainab, 'lead'), (t_mob, hamza, 'member'),
    (t_data, usman, 'lead'), (t_data, bilal, 'member'),
    (t_des, fatima, 'lead'),
    (t_web, ayesha, 'member'), (t_des, ayesha, 'member');
  if me is not null then
    insert into public.team_members (team_id, user_id, role) values (t_web, me, 'lead'), (t_data, me, 'member');
  end if;

  -- ── projects & milestones ────────────────────────────────────────────────
  insert into public.projects (team_id, company_id, name, description, color, created_by, visibility, work_type, start_date, target_date, created_at)
    values (t_web, co, 'Customer portal v2', 'New self-service portal: billing, invoices and support tickets in one place.', '#4f46e5', sara, 'company', 'software', d - 35, d + 28, now() - interval '40 days')
    returning id into p_portal;
  insert into public.projects (team_id, company_id, name, description, color, created_by, visibility, work_type, start_date, target_date, created_at)
    values (t_mob, co, 'Offline mode', 'Let field staff keep working without signal and sync later.', '#0ea5e9', zainab, 'team', 'software', d - 50, d + 10, now() - interval '55 days')
    returning id into p_offline;
  insert into public.projects (team_id, company_id, name, description, color, created_by, visibility, work_type, start_date, target_date, created_at)
    values (t_data, co, 'Reporting warehouse', 'One trusted place for revenue and usage numbers.', '#14b8a6', usman, 'company', 'software', d - 60, d - 3, now() - interval '65 days')
    returning id into p_wh;
  insert into public.projects (team_id, company_id, name, description, color, created_by, visibility, work_type, start_date, target_date, created_at)
    values (t_des, co, 'Brand refresh', 'New logo, colours and type across the product and website.', '#f43f5e', fatima, 'company', 'general', d - 20, d + 40, now() - interval '25 days')
    returning id into p_brand;

  insert into public.milestones (company_id, project_id, name, date, done, created_by) values
    (co, p_portal, 'Design sign-off', d - 20, true, sara),
    (co, p_portal, 'Beta for 10 customers', d + 7, false, sara),
    (co, p_portal, 'Launch', d + 28, false, sara),
    (co, p_offline, 'Sync engine ready', d - 5, true, zainab),
    (co, p_offline, 'Field pilot', d + 8, false, zainab),
    (co, p_wh, 'Revenue dashboard live', d - 3, false, usman),
    (co, p_brand, 'Logo chosen', d + 5, false, fatima);

  -- ── sprints (Web) ─────────────────────────────────────────────────────────
  insert into public.sprints (company_id, team_id, name, goal, start_date, end_date, status, committed, completed, committed_tasks, completed_tasks, created_by, started_at, closed_at)
    values (co, t_web, 'Sprint 7', 'Invoices page and PDF export', d - 22, d - 9, 'closed', 21, 18, 7, 6, sara, (d - 22)::timestamptz, (d - 9)::timestamptz)
    returning id into sp_old;
  insert into public.sprints (company_id, team_id, name, goal, start_date, end_date, status, committed, committed_tasks, created_by, started_at)
    values (co, t_web, 'Sprint 8', 'Billing settings and the beta invite flow', d - 8, d + 5, 'active', 26, 8, sara, (d - 8)::timestamptz)
    returning id into sp_now;
  insert into public.sprints (company_id, team_id, name, goal, start_date, end_date, status, created_by)
    values (co, t_web, 'Sprint 9', 'Support tickets', d + 6, d + 19, 'planned', sara)
    returning id into sp_next;

  -- ── custom fields on the portal project ──────────────────────────────────
  insert into public.project_fields (project_id, name, kind, options, position) values (p_portal, 'Severity', 'select', '["S1","S2","S3"]', 0) returning id into f_sev;
  insert into public.project_fields (project_id, name, kind, position) values (p_portal, 'Customer', 'text', 1) returning id into f_cust;
  insert into public.project_fields (project_id, name, kind, position) values (p_portal, 'Ready for QA', 'checkbox', 2) returning id into f_qa;

  -- ── company tasks: Customer portal v2 (Web) ───────────────────────────────
  t1 := pg_temp.demo_task(sara, 'Invoices page', 'Done', d - 21, co, t_web, p_portal, hamza, 'high', d - 12, 'List, filter and download invoices.', 5, d - 21, sp_old);
  t2 := pg_temp.demo_task(sara, 'PDF export for invoices', 'Done', d - 20, co, t_web, p_portal, sara, 'medium', d - 10, null, 3, d - 18, sp_old);
  t3 := pg_temp.demo_task(sara, 'Billing settings screen', 'Doing', d - 8, co, t_web, p_portal, hamza, 'high', d + 2, 'Change plan, update card, see next charge.', 5, d - 7, sp_now, null, sara);
  t4 := pg_temp.demo_task(sara, 'Beta invite flow', 'Doing', d - 8, co, t_web, p_portal, coalesce(me, sara), 'urgent', d + 1, 'Invite 10 customers to the beta with a magic link.', 3, d - 6, sp_now);
  t5 := pg_temp.demo_task(sara, 'Fix session timeout on Safari', 'Delayed', d - 7, co, t_web, p_portal, sara, 'urgent', d - 2, 'Users get logged out after 5 minutes on Safari 17.', 2, d - 7, sp_now);
  t6 := pg_temp.demo_task(sara, 'Support tickets list', 'Doing', d - 2, co, t_web, p_portal, hamza, 'medium', d + 14, null, 8, d + 6, sp_next);
  t7 := pg_temp.demo_task(sara, 'Accessibility pass on forms', 'Done', d - 6, co, t_web, p_portal, fatima, 'medium', d - 1, null, 2, d - 5, sp_now);
  t8 := pg_temp.demo_task(sara, 'Empty states for portal', 'Doing', d - 5, co, t_web, p_portal, fatima, 'low', d + 4, null, 1, d - 3, sp_now);
  perform pg_temp.demo_task(sara, 'Load testing for billing API', 'Doing', d - 4, co, t_web, p_portal, coalesce(me, bilal), 'high', d + 6, null, 5, d, sp_now);
  perform pg_temp.demo_task(sara, 'Write beta announcement email', 'Doing', d - 1, co, t_web, p_portal, coalesce(me, ayesha), 'medium', d + 5, null, 1, d + 2);
  perform pg_temp.demo_task(sara, 'Usage graphs on the dashboard', 'Doing', d - 3, co, t_web, p_portal, sara, 'low', d + 20, null, 5, d + 8);
  perform pg_temp.demo_task(sara, 'Cookie banner copy', 'Done', d - 30, co, t_web, p_portal, hamza, 'low', d - 26, null, 1, d - 30, sp_old);

  -- subtasks, checklist, dependency, watchers, comments, reactions, field values
  perform pg_temp.demo_task(sara, 'Card update form', 'Done', d - 7, co, t_web, p_portal, hamza, 'medium', d - 2, null, null, null, sp_now, t3);
  perform pg_temp.demo_task(sara, 'Plan change confirmation', 'Doing', d - 7, co, t_web, p_portal, hamza, 'medium', d + 1, null, null, null, sp_now, t3);
  insert into public.task_checklist_items (task_id, title, done, position, done_by) values
    (t3, 'Design reviewed', true, 0, fatima), (t3, 'Stripe test cards pass', true, 1, hamza),
    (t3, 'Error messages written', false, 2, null), (t3, 'QA on mobile', false, 3, null),
    (t4, 'Magic link email template', true, 0, sara), (t4, 'Invite list from sales', false, 1, null);
  insert into public.task_dependencies (task_id, blocked_by_id, created_by) values (t6, t3, sara), (t4, t5, sara);
  insert into public.task_watchers (task_id, user_id) values (t3, sara), (t3, bilal), (t5, bilal), (t4, ayesha);
  insert into public.task_comments (task_id, user_id, content, created_at) values
    (t3, sara, 'Let''s keep the plan picker the same as on the pricing page.', now() - interval '3 days'),
    (t3, hamza, 'Done — reused the pricing cards. Card form is in review.', now() - interval '2 days'),
    (t5, bilal, 'Is this the ITP cookie issue again? @Sara can you check the refresh token path?', now() - interval '1 day'),
    (t1, ayesha, 'Customers love this. Great work!', now() - interval '11 days');
  insert into public.task_reactions (task_id, user_id, emoji) values (t1, ayesha, '🎉'), (t1, sara, '👍'), (t7, sara, '👍');
  insert into public.task_field_values (task_id, field_id, value) values
    (t5, f_sev, '"S1"'), (t5, f_cust, '"Habib Traders"'), (t3, f_sev, '"S2"'), (t3, f_qa, 'false'),
    (t7, f_qa, 'true'), (t4, f_cust, '"Beta group"');

  -- ── Offline mode (Mobile) ─────────────────────────────────────────────────
  perform pg_temp.demo_task(zainab, 'Local database for drafts', 'Done', d - 45, co, t_mob, p_offline, zainab, 'high', d - 30, null, 8, d - 45);
  perform pg_temp.demo_task(zainab, 'Sync queue with retries', 'Done', d - 30, co, t_mob, p_offline, zainab, 'high', d - 6, null, 8, d - 28);
  perform pg_temp.demo_task(zainab, 'Conflict screen when two people edit', 'Doing', d - 10, co, t_mob, p_offline, hamza, 'high', d + 3, null, 5, d - 8);
  perform pg_temp.demo_task(zainab, 'Offline banner and sync status', 'Doing', d - 5, co, t_mob, p_offline, zainab, 'medium', d + 6, null, 3, d - 2);
  perform pg_temp.demo_task(zainab, 'Battery test on low-end Android', 'Delayed', d - 12, co, t_mob, p_offline, zainab, 'medium', d - 3, 'Waiting for the test phones to arrive.', 2, d - 9);
  perform pg_temp.demo_task(zainab, 'Pilot checklist for field staff', 'Doing', d - 3, co, t_mob, p_offline, coalesce(me, zainab), 'medium', d + 7, null, 1, d + 2);

  -- ── Reporting warehouse (Data, estimates in hours) ───────────────────────
  perform pg_temp.demo_task(usman, 'Load Stripe payments nightly', 'Done', d - 55, co, t_data, p_wh, usman, 'high', d - 40, null, 12, d - 55);
  perform pg_temp.demo_task(usman, 'Revenue model in dbt', 'Done', d - 40, co, t_data, p_wh, usman, 'high', d - 20, null, 16, d - 38);
  perform pg_temp.demo_task(usman, 'Churn by plan chart', 'Doing', d - 14, co, t_data, p_wh, usman, 'medium', d - 2, null, 6, d - 10);
  perform pg_temp.demo_task(usman, 'Data dictionary on the wiki', 'Delayed', d - 20, co, t_data, p_wh, bilal, 'low', d - 5, null, 4, d - 15);
  perform pg_temp.demo_task(usman, 'Check numbers with finance', 'Doing', d - 2, co, t_data, p_wh, coalesce(me, usman), 'high', d + 2, null, 3, d);

  -- ── Brand refresh (Design) ───────────────────────────────────────────────
  perform pg_temp.demo_task(fatima, 'Moodboard', 'Done', d - 18, co, t_des, p_brand, fatima, 'medium', d - 12, null, null, d - 18);
  perform pg_temp.demo_task(fatima, 'Three logo directions', 'Doing', d - 10, co, t_des, p_brand, fatima, 'high', d + 4, null, null, d - 8);
  perform pg_temp.demo_task(fatima, 'Colour palette with contrast checks', 'Doing', d - 6, co, t_des, p_brand, fatima, 'medium', d + 12, null, null, d);
  perform pg_temp.demo_task(fatima, 'Interview 5 customers about the brand', 'Done', d - 16, co, t_des, p_brand, ayesha, 'medium', d - 9, null, null, d - 16);

  -- a few company tasks with no project, spread over the last 90 days (analytics)
  for i in 1..40 loop
    uid := (array[sara, hamza, zainab, usman, fatima, bilal])[1 + (i % 6)];
    st := case when i % 9 = 0 then 'Delayed' when i % 4 = 0 then 'Doing' else 'Done' end;
    perform pg_temp.demo_task(uid,
      (array['Review pull requests','Update dependencies','Customer call notes','Fix flaky test','Write release notes',
             'Triage bug reports','Improve error logging','Pair on onboarding','Clean up feature flags','Draft RFC'])[1 + (i % 10)],
      st, d - (i * 2), co,
      (array[t_web, t_web, t_mob, t_data, t_des, t_data])[1 + (i % 6)], null, uid,
      (array['low','medium','medium','high'])[1 + (i % 4)], d - (i * 2) + 3);
  end loop;

  -- today's team activity, so every team feed has something on it
  perform pg_temp.demo_task(sara, 'Reviewed billing settings PR', 'Done', d, co, t_web, p_portal, sara, 'medium', d);
  perform pg_temp.demo_task(hamza, 'Card form validation messages', 'Done', d, co, t_web, p_portal, hamza, 'medium', d);
  perform pg_temp.demo_task(hamza, 'Plan change confirmation screen', 'Doing', d, co, t_web, p_portal, hamza, 'high', d + 1);
  perform pg_temp.demo_task(fatima, 'Empty-state illustrations', 'Done', d, co, t_web, p_portal, fatima, 'low', d);
  perform pg_temp.demo_task(zainab, 'Sync status indicator', 'Doing', d, co, t_mob, p_offline, zainab, 'medium', d + 2);
  perform pg_temp.demo_task(hamza, 'Paired on conflict screen', 'Done', d, co, t_mob, p_offline, hamza, 'medium', d);
  perform pg_temp.demo_task(usman, 'Refund join fix', 'Done', d, co, t_data, p_wh, usman, 'high', d);
  perform pg_temp.demo_task(fatima, 'Logo direction B sketches', 'Done', d, co, t_des, p_brand, fatima, 'high', d);

  -- ── personal history: ~60 days for every demo person (heatmap, streaks) ──
  titles := array['Morning planning','Inbox zero','Read an article on Postgres','Gym','Call with mentor','Weekly review',
                  'Learn a new keyboard shortcut','Tidy up notes','Plan the weekend','Practice Urdu calligraphy',
                  'Read 20 pages','Update CV','Grocery list','Water the plants','Write in journal'];
  for r in select unnest(array[ayesha, bilal, sara, hamza, zainab, usman, fatima]) as u loop
    for i in 0..60 loop
      if random() < 0.8 then
        perform pg_temp.demo_task(r.u, titles[1 + floor(random() * 15)::int],
          case when i = 0 and random() < 0.5 then 'Doing' when random() < 0.08 then 'Delayed' else 'Done' end, d - i);
      end if;
      if random() < 0.35 then
        perform pg_temp.demo_task(r.u, titles[1 + floor(random() * 15)::int], 'Done', d - i);
      end if;
    end loop;
  end loop;

  -- ── tags & goals (personal) ──────────────────────────────────────────────
  insert into public.tags (user_id, name, color) values (sara, 'deep work', '#4f46e5'), (sara, 'health', '#10b981'), (hamza, 'learning', '#f59e0b');
  insert into public.goals (user_id, title, period, target) values
    (sara, 'Finish 15 tasks this week', 'week', 15), (hamza, 'Finish 40 tasks this month', 'month', 40), (ayesha, 'Finish 10 tasks this week', 'week', 10);
  insert into public.goals (user_id, title, period, target, team_id, company_id) values (sara, 'Web team: 30 dones this week', 'week', 30, t_web, co);

  -- ── standups for today ───────────────────────────────────────────────────
  insert into public.standups (team_id, user_id, company_id, date, yesterday, today, blockers) values
    (t_web, sara, co, d, 'Reviewed the billing settings PR, paired on Safari bug.', 'Fix the Safari session timeout.', 'Need a Mac with Safari 17 for testing.'),
    (t_web, hamza, co, d, 'Card update form merged.', 'Plan change confirmation screen.', null),
    (t_mob, zainab, co, d, 'Offline banner design.', 'Sync status indicator.', 'Test phones still not here.');

  -- ── meetings ─────────────────────────────────────────────────────────────
  insert into public.meetings (company_id, team_id, project_id, title, kind, starts_at, duration_min, location, agenda, notes, status, created_by)
    values (co, t_web, p_portal, 'Portal beta planning', 'meeting', (d - 3) + time '06:00', 45, 'Google Meet',
      E'- Who joins the beta\n- What must work on day one\n- Support plan',
      E'We picked 10 customers from the sales list. Billing settings must be done before invites go out. Sara owns the Safari fix.',
      'done', sara) returning id into m1;
  insert into public.meeting_items (meeting_id, kind, text, done, assignee_id, due_date, position, created_by) values
    (m1, 'decision', 'Beta starts with 10 customers, invite-only', false, null, null, 0, sara),
    (m1, 'action', 'Send the invite list to Sara', true, ayesha, d - 1, 1, sara),
    (m1, 'action', 'Fix Safari session timeout before invites', false, sara, d + 1, 2, sara),
    (m1, 'topic', 'Support plan for beta users', false, null, null, 3, sara);
  insert into public.meeting_attendees (meeting_id, user_id, response) values (m1, sara, 'yes'), (m1, hamza, 'yes'), (m1, ayesha, 'yes'), (m1, fatima, 'maybe');

  insert into public.meetings (company_id, team_id, title, kind, starts_at, duration_min, location, agenda, status, created_by, recurrence)
    values (co, t_web, 'Sprint 8 review', 'review', (d + 5) + time '07:00', 60, 'Office — Room 2', E'- Demo billing settings\n- Beta invite flow\n- What slipped and why', 'scheduled', sara, null)
    returning id into m2;
  insert into public.meeting_attendees (meeting_id, user_id, response) values (m2, sara, 'yes'), (m2, hamza, 'pending'), (m2, bilal, 'yes');

  insert into public.meetings (company_id, team_id, title, kind, starts_at, duration_min, status, created_by, notes)
    values (co, t_web, 'Sprint 7 retro', 'retro', (d - 9) + time '08:00', 45, 'done', sara, 'Good sprint, PDF export took longer than planned.')
    returning id into m3;
  insert into public.meeting_items (meeting_id, kind, text, created_by, votes, position) values
    (m3, 'went_well', 'Invoices page shipped early', hamza, array[sara, fatima], 0),
    (m3, 'went_well', 'Design and dev paired every day', fatima, array[hamza], 1),
    (m3, 'to_improve', 'PDF library choice took 2 days', sara, array[hamza, fatima], 2),
    (m3, 'to_improve', 'Too many meetings on Thursday', hamza, '{}', 3),
    (m3, 'idea', 'Keep a spike budget for unknown libraries', sara, array[hamza], 4);
  insert into public.meeting_attendees (meeting_id, user_id, response) values (m3, sara, 'yes'), (m3, hamza, 'yes'), (m3, fatima, 'yes');

  insert into public.meetings (company_id, title, kind, starts_at, duration_min, status, private, created_by, agenda)
    values (co, '1:1 Bilal / Usman', 'one_on_one', (d + 1) + time '05:30', 30, 'scheduled', true, bilal, E'- Warehouse launch\n- Growth plan')
    returning id into m4;
  insert into public.meeting_attendees (meeting_id, user_id, response) values (m4, bilal, 'yes'), (m4, usman, 'yes');

  -- ── announcements ────────────────────────────────────────────────────────
  insert into public.announcements (company_id, author_id, title, body, audience, pinned, created_at) values
    (co, ayesha, 'Welcome to Taskflow!', E'We''re moving all our work here this month.\n\nLog what you finish each day, and keep personal tasks in your Personal space — nobody else can see those.', 'company', true, now() - interval '20 days'),
    (co, ayesha, 'Office closed on 9 November', 'Iqbal Day — enjoy the long weekend.', 'company', false, now() - interval '2 days');
  insert into public.announcements (company_id, author_id, title, body, audience, team_id, created_at) values
    (co, sara, 'Code freeze for the beta', 'No merges to main after Thursday 5pm until the beta goes out.', 'team', t_web, now() - interval '1 day');

  -- ── project updates ──────────────────────────────────────────────────────
  insert into public.project_updates (company_id, project_id, author_id, health, summary, highlights, risks, next_steps, created_at) values
    (co, p_portal, sara, 'at_risk', 'Beta invites may slip a few days because of the Safari bug.', 'Invoices and PDF export are live for internal users.', 'Safari session timeout blocks the beta.', 'Fix Safari, then send invites.', now() - interval '1 day'),
    (co, p_offline, zainab, 'on_track', 'Sync engine is done; pilot next week.', 'Conflict screen designed.', 'Test phones are late.', 'Battery tests once phones arrive.', now() - interval '3 days'),
    (co, p_wh, usman, 'off_track', 'Revenue dashboard is past its date — finance numbers don''t match yet.', 'Stripe data loads every night.', 'Refunds are counted twice.', 'Fix the refund join, review with finance.', now() - interval '2 days'),
    (co, p_brand, fatima, 'on_track', 'Moodboard approved; logo directions in progress.', null, null, 'Show three directions on Friday.', now() - interval '4 days');

  -- ── decisions ────────────────────────────────────────────────────────────
  insert into public.decisions (company_id, team_id, project_id, meeting_id, title, context, status, decided_on, owner_id, created_by) values
    (co, t_web, p_portal, m1, 'Beta is invite-only, 10 customers', 'Keeps support load small while billing is new.', 'decided', d - 3, sara, sara),
    (co, null, null, null, 'Two-week sprints for all engineering teams', 'Same rhythm makes planning across teams easier.', 'decided', d - 40, bilal, bilal),
    (co, t_data, p_wh, null, 'Use dbt for all revenue models', null, 'decided', d - 45, usman, usman),
    (co, t_des, p_brand, null, 'Keep indigo as the main brand colour?', 'Waiting for customer interviews.', 'proposed', d, fatima, fatima);

  -- ── wiki ─────────────────────────────────────────────────────────────────
  insert into public.wiki_pages (company_id, title, body, created_by, updated_by) values
    (co, 'How we work', E'# How we work\n\n- We ship every two weeks.\n- Every task has one owner.\n- Write decisions down in the **Decision log**.\n\n## Meetings\nStandups are written, not spoken. Retros happen after every sprint.', ayesha, ayesha)
    returning id into w1;
  insert into public.wiki_pages (company_id, parent_id, title, body, created_by, updated_by) values
    (co, w1, 'Code review checklist', E'1. Does it have tests?\n2. Are errors shown to the user in plain words?\n3. Did you check it on mobile?', sara, sara);
  insert into public.wiki_pages (company_id, team_id, title, body, created_by, updated_by) values
    (co, t_data, 'Data dictionary', E'**mrr** — monthly recurring revenue, after discounts, before tax.\n\n**active customer** — paid in the last 35 days.', usman, usman),
    (co, null, 'Leave policy', E'- 20 days of vacation a year\n- Sick days: tell your lead the same morning\n- Request time off in Taskflow → Time off', ayesha, ayesha);

  -- ── time off & holidays ──────────────────────────────────────────────────
  insert into public.time_off (company_id, user_id, kind, start_date, end_date, note, status, decided_by, decided_at, created_by) values
    (co, fatima, 'vacation', d + 9, d + 13, 'Family wedding in Lahore', 'approved', ayesha, now() - interval '5 days', fatima),
    (co, usman, 'sick', d, d, null, 'approved', bilal, now(), usman),
    (co, hamza, 'personal', d + 15, d + 15, 'University exam', 'pending', null, null, hamza);
  insert into public.company_holidays (company_id, date, name) values
    (co, make_date(extract(year from d)::int, 11, 9), 'Iqbal Day'),
    (co, make_date(extract(year from d)::int, 12, 25), 'Quaid-e-Azam Day');

  -- ── time tracking (last 2 weeks) ─────────────────────────────────────────
  for i in 0..13 loop
    if extract(isodow from d - i) < 6 then
      insert into public.time_entries (user_id, company_id, task_id, project_id, team_id, work_date, minutes, note, billable) values
        (hamza, co, t3, p_portal, t_web, d - i, 120 + (i * 7) % 90, 'Billing settings', true),
        (sara, co, t5, p_portal, t_web, d - i, 60 + (i * 11) % 60, 'Safari bug', false),
        (usman, co, null, p_wh, t_data, d - i, 180 + (i * 13) % 120, 'Warehouse work', false);
    end if;
  end loop;

  -- ── request form, submission, approvals ──────────────────────────────────
  insert into public.request_forms (company_id, project_id, name, description, questions, default_priority, assignee_id, created_by)
  values (co, p_portal, 'Report a portal bug', 'Something broken in the customer portal? Tell the Web team here.',
    jsonb_build_array(
      jsonb_build_object('id','what','label','What''s broken?','kind','text','required',true,'options','[]'::jsonb,'maps_to','title'),
      jsonb_build_object('id','details','label','Steps to see it','kind','textarea','required',false,'options','[]'::jsonb,'maps_to','description'),
      jsonb_build_object('id','sev','label','How bad is it?','kind','select','required',true,'options',jsonb_build_array('S1','S2','S3'),'maps_to','field:' || f_sev),
      jsonb_build_object('id','who','label','Which customer?','kind','text','required',false,'options','[]'::jsonb,'maps_to','field:' || f_cust)),
    'high', sara, sara)
  returning id into frm;
  t8 := pg_temp.demo_task(ayesha, 'Invoice totals show wrong currency', 'Doing', d - 1, co, t_web, p_portal, sara, 'high', null,
    E'Open an invoice for a USD customer — the total says PKR.\n\nRequested by Ayesha Khan via "Report a portal bug"');
  insert into public.request_submissions (form_id, task_id, submitted_by, answers)
    values (frm, t8, ayesha, jsonb_build_object('what','Invoice totals show wrong currency','sev','S2','who','Habib Traders'));
  insert into public.task_field_values (task_id, field_id, value) values (t8, f_sev, '"S2"'), (t8, f_cust, '"Habib Traders"');

  insert into public.approvals (task_id, company_id, requested_by, approver_id, status, note) values
    (t4, co, coalesce(me, sara), ayesha, 'pending', 'OK to send the beta invites this week?');
  insert into public.approvals (task_id, company_id, requested_by, approver_id, status, note, comment, decided_at) values
    (t7, co, fatima, sara, 'approved', 'Accessibility fixes ready to ship?', 'Looks great, ship it.', now() - interval '1 day');
  if me is not null then
    insert into public.approvals (task_id, company_id, requested_by, approver_id, status, note)
      values (t3, co, hamza, me, 'pending', 'Can you approve the new billing screen copy?');
  end if;

  -- ── job board ────────────────────────────────────────────────────────────
  insert into public.job_postings (company_id, team_id, title, description, skills, level, kind, location, openings, status, hiring_manager_id, posted_by, visibility, closes_on)
    values (co, t_data, 'Analytics Engineer', E'Help us build the **reporting warehouse**.\n\n- Own dbt models\n- Work with finance on revenue numbers',
      '{sql,dbt,python}', 'L3', 'full_time', 'Remote (Pakistan)', 1, 'open', usman, usman, 'public', d + 30)
    returning id into job1;
  insert into public.job_postings (company_id, team_id, title, description, skills, level, kind, location, openings, status, hiring_manager_id, posted_by, visibility)
    values (co, t_mob, 'Mobile Engineer (React Native)', 'Join Zainab on offline mode and the field app.', '{react native,javascript,react}', 'L2', 'full_time', 'Karachi office', 1, 'open', zainab, bilal, 'public')
    returning id into job2;
  insert into public.job_postings (company_id, team_id, title, description, skills, kind, location, openings, status, hiring_manager_id, posted_by, visibility)
    values (co, t_des, 'Illustrations for the new website', 'A two-week gig: 6 spot illustrations in the new brand style.', '{illustration,figma}', 'gig', 'Remote', 1, 'open', fatima, fatima, 'internal')
    returning id into job3;
  insert into public.job_applications (posting_id, user_id, note, status, hiring_note) values
    (job2, hamza, 'I''ve been helping on the conflict screen and would love to move to Mobile full time.', 'interview', 'Strong React, needs native module experience.'),
    (job1, sara, 'I wrote most of our SQL reports before joining Web.', 'reviewing', null);

  -- ── public profiles ──────────────────────────────────────────────────────
  insert into public.public_profiles (user_id, handle, is_public, headline, bio, location, genres, skills, links, showcase, open_to_work, open_to, show_companies) values
    (sara, 'sara-malik', true, 'Senior frontend engineer · accessible, fast interfaces',
      'I build web apps people enjoy using. Eight years of React, a soft spot for accessibility.', 'Karachi',
      '{software,design}', '{react,typescript,accessibility,testing}',
      '[{"label":"GitHub","url":"https://github.com"}]',
      '[{"title":"Invoices page","description":"Self-service invoices for 2,000 customers.","url":null}]', false, '{}', true),
    (fatima, 'fatima-noor', true, 'Design lead · brand and product design', 'From logos to design systems.', 'Lahore',
      '{design,product}', '{figma,user research,design systems,branding}', '[]',
      '[{"title":"Karachi Code brand refresh","description":"New identity, in progress.","url":null}]', true, '{project,gig}', true),
    (usman, 'usman-tariq', true, 'Data engineer · dbt, Airflow, Postgres', null, 'Islamabad',
      '{data,software}', '{sql,python,airflow,dbt}', '[]', '[]', false, '{}', false);

  -- ── portfolio ────────────────────────────────────────────────────────────
  insert into public.portfolios (company_id, name, description, owner_id) values (co, 'Q4 launches', 'Everything customers will see before the year ends.', ayesha)
    returning id into pf;
  insert into public.portfolio_projects (portfolio_id, project_id) values (pf, p_portal), (pf, p_offline), (pf, p_brand), (pf, p_wh);

  -- ── a few notifications so the bell isn't empty ──────────────────────────
  insert into public.notifications (user_id, actor_id, type, message, link, company_id, created_at) values
    (ayesha, coalesce(me, sara), 'approval', 'Your approval is needed: Beta invite flow', '/tasks/' || t4, co, now() - interval '2 hours'),
    (sara, ayesha, 'request', 'New request via Report a portal bug: Invoice totals show wrong currency', '/tasks/' || t8, co, now() - interval '1 day'),
    (hamza, zainab, 'job', 'Your application for Mobile Engineer (React Native) moved to interview', '/jobs/' || job2, co, now() - interval '5 hours');
  if me is not null then
    insert into public.notifications (user_id, actor_id, type, message, link, company_id) values
      (me, ayesha, 'invite', 'You were added to the Karachi Code demo company', '/company', co),
      (me, hamza, 'approval', 'Your approval is needed: Billing settings screen', '/tasks/' || t3, co);
  end if;

  raise notice 'Demo data ready: company Karachi Code (%), % tasks. Log in as ayesha@demo.taskflow.dev / demo1234%',
    co, (select count(*) from public.tasks t join public.users u on u.id = t.user_id where u.email like '%@demo.taskflow.dev'),
    case when me is null then '' else ' — or with your own account (added as admin).' end;
end
$seed$;
