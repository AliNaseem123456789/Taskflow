# Taskflow — setup

## 1. Install

```bash
cd backend  && npm install
cd frontend && npm install
```

## 2. Environment files

Copy `backend/.env.example` → `backend/.env` and `frontend/.env.example` → `frontend/.env`, then fill in values.
**Required** in `backend/.env`: `SUPABASE_URL`, `SUPABASE_API`, `JWT_SECRET`, `FRONTEND_URL`, `EMAIL_USER`, `EMAIL_PASS`.
Everything under "Optional integrations" can stay empty; that feature just stays off.

Generate secrets with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

## 3. Database (Supabase → SQL Editor)

Run these once, in order. Each is safe to run again.

| File | What it adds |
|---|---|
| `backend/sql/001_stage1_fixes.sql` | timezones, per-user unique keys, cascade deletes |
| `backend/sql/002_stage2_account.sql` | email verification, reset-password links |
| `backend/sql/003_stage3_tasks.sql` | due date, priority, blocker, repeat, goals, notifications |
| `backend/sql/004_stage4_teams.sql` | invites, scheduled digest, projects, standups |
| `backend/sql/005_stage5_integrations.sql` | SMS/Slack/push, Google/GitHub/Jira |
| `backend/sql/006_phaseA1_companies.sql` | companies, roles, workspaces (moves existing teams into companies) |
| `backend/sql/007_phaseA2_structure.sql` | departments, sub-teams, org chart |
| `backend/sql/008_phaseA3_joining.sql` | company invites, email-domain join, onboarding checklists |
| `backend/sql/009_phaseA4_work.sql` | reviewers, watchers, subtasks, checklists, dependencies, project columns |
| `backend/sql/010_phaseA5_company_life.sql` | team moves, announcements |
| `backend/sql/011_phaseB1_meetings.sql` | meetings, 1:1s, retros |
| `backend/sql/012_phaseB2_updates_decisions_wiki.sql` | project updates, decision log, wiki |
| `backend/sql/013_phaseB3_timeoff_workload.sql` | time off, company holidays |
| `backend/sql/014_phaseC_ai.sql` | AI usage (daily limits) |
| `backend/sql/security_enable_rls.sql` | **recommended** — read the comment at the top first |

`000_sessions_table.sql` is reference only (that table already exists).

## 4. Run

```bash
cd backend  && npm run dev     # http://localhost:5000
cd frontend && npm run dev     # http://localhost:5174
```

Optional — the AI service (Python):

```bash
cd chatbot
python -m venv .venv && .venv\Scripts\activate     # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
copy .env.example .env                              # then put your Groq key in AI_API_KEY
uvicorn app.main:app --port 8000 --reload           # http://localhost:8000/api/health
```

and set `VITE_AI_API_URL=http://localhost:8000` in `frontend/.env`. Without it, AI buttons stay hidden.
Daily AI limits live in `backend/.env`: `AI_DAILY_LIMIT_USER`, `AI_DAILY_LIMIT_COMPANY`. More in `chatbot/README.md`.

---

## Integrations

### Email (required) — Gmail
`EMAIL_USER` = your Gmail address. `EMAIL_PASS` = a **Gmail App Password**
(Google Account → Security → 2-Step Verification → App passwords), not your normal password.

### Browser notifications — nothing to do
Keys are generated on first start and saved in the `app_config` table.
Each user clicks **Integrations → Enable on this device**.
Needs `http://localhost` or **https** (browsers block it on plain http elsewhere).

### Slack — nothing to set on the server
Each user pastes their own Incoming Webhook on the Integrations page.
Team admins can add a channel webhook on **Team → Manage** so the digest is posted there.

### GitHub and Jira — nothing to set on the server
Each user pastes a token on the Integrations page:
- GitHub: fine-grained personal access token with read access to *Issues*, *Pull requests*, *Metadata*.
- Jira: `id.atlassian.com → Security → API tokens`, plus the site (`yourteam.atlassian.net`) and login email.

### SMS — Twilio (server keys)
1. Sign up at twilio.com, get a phone number.
2. Put `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER` (e.g. `+15551234567`) in `backend/.env`.
3. Trial accounts only text **verified** numbers (Twilio console → Verified Caller IDs).
4. Users add their number (`+923001234567`) on the Integrations page.

### Google Calendar (server keys)
1. console.cloud.google.com → create a project.
2. APIs & Services → Library → enable **Google Calendar API**.
3. OAuth consent screen → External → add yourself under **Test users**.
4. Credentials → Create credentials → OAuth client ID → **Web application**.
   Authorised redirect URI: `http://localhost:5000/integrations/google/callback`
5. Put `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` (same URI) in `backend/.env`.
6. When you deploy, add the live callback URL in Google and update `GOOGLE_REDIRECT_URI`.

### Encryption of stored tokens
Slack webhooks and Google/GitHub/Jira tokens are encrypted with `ENCRYPTION_KEY`
(falls back to `JWT_SECRET`). Set `ENCRYPTION_KEY` once and don't change it —
changing it means users have to reconnect.

---

## Background jobs (run inside the backend)

| Job | When |
|---|---|
| Reminders (email / SMS / Slack / push) | every minute, in each user's timezone |
| Team digests | every minute, in each team's timezone |
| Recurring tasks | every hour (copies appear just after each user's midnight) |
| GitHub / Jira import | every 3 hours |

With pm2 cluster mode only worker 0 runs jobs. Live updates (`/events`) are kept
in memory, so with several workers a user gets instant updates only from their own
worker — pages also refresh every minute.
