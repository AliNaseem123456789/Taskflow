# Taskflow AI service

A small Python (FastAPI) service that gives Taskflow its AI features. It runs next
to the Node backend and is **optional**: with no key, the AI buttons in the app stay hidden.

## How it stays safe

- It never connects to the database. Every read and write goes through the
  Taskflow backend **as the person asking** (their own login token), so the AI
  sees exactly what they can see. Personal dones of other people are never reachable.
- Anything that would change data (new tasks, meeting action items…) comes back
  as a *suggestion*; the person confirms it in the app.
- Every AI call is counted per person and per company (`AI_DAILY_LIMIT_USER`,
  `AI_DAILY_LIMIT_COMPANY` in the backend's `.env`). Admins see usage under
  **Company → AI usage**.

## Run it locally

```bash
cd chatbot
python -m venv .venv
.venv\Scripts\activate          # Windows   (macOS/Linux: source .venv/bin/activate)
pip install -r requirements.txt
copy .env.example .env          # macOS/Linux: cp .env.example .env
# put your Groq key in AI_API_KEY
uvicorn app.main:app --port 8000 --reload
```

Then in `frontend/.env` set `VITE_AI_API_URL=http://localhost:8000` and restart the frontend.
Check it's up: <http://localhost:8000/api/health> → `"ai": true`.

## Settings (`chatbot/.env`)

| Name | What |
|---|---|
| `AI_API_KEY` | Groq API key (console.groq.com → API Keys) |
| `AI_BASE_URL` | Any OpenAI-compatible API. Default: Groq `https://api.groq.com/openai/v1` |
| `AI_MODEL` | Main model. Default `openai/gpt-oss-120b` |
| `AI_FALLBACK_MODEL` | Tried when the main one is busy. Default `llama-3.3-70b-versatile` |
| `BACKEND_URL` | The Taskflow backend, e.g. `http://localhost:5000` |
| `FRONTEND_URL` | The app's address(es), comma-separated — allowed to call this service |

## Deploying later

Any host that runs Python works (Render, Railway, Fly.io, a VM):
start command `uvicorn app.main:app --host 0.0.0.0 --port $PORT`.
Set the same variables there, with `BACKEND_URL` and `FRONTEND_URL` pointing at the live
addresses, then set `VITE_AI_API_URL` in the frontend to this service's address.

## Endpoints

| | |
|---|---|
| `GET /api/health` | `{ ai: true/false }` — the app shows AI buttons only when true |
| `POST /api/chat` | Assistant. Signed in: answers about your work using read-only look-ups and may *suggest* tasks. Not signed in: answers questions about Taskflow (landing page). |
| `POST /api/ai-summary` | Summary of your own tasks for a date range (Reports page) |
| `POST /api/tasks/breakdown` | Subtasks + checklist for a task |
| `POST /api/tasks/parse` | A sentence → task fields ("ask Sara to … by Friday") |
| `POST /api/tasks/suggest-assignee` | Who should do a task (skills, workload, time off) |
| `POST /api/people/handover` | Hand-over note for someone moving team or leaving |
| `POST /api/meetings/extract` | Meeting notes → summary, decisions, action items |
| `POST /api/meetings/retro-themes` | Retro cards grouped into themes + suggested actions |
| `POST /api/projects/update-draft` | Draft of a project status update |
| `POST /api/standup/draft` | Your standup / weekly report draft |
| `POST /api/wiki/ask` | Answer from the wiki, with the pages it used |
| `POST /api/solve` | "Solve a team problem": diagnosis, plan, suggested tasks |

## Tests

`tests/mock_llm.py` is a stand-in for Groq (no key or network needed); the end-to-end
tests run the backend, this service and the mock together.
