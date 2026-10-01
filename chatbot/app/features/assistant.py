"""The assistant chat.

Signed in: answers questions about the person's work by calling read-only tools
(each one is a normal Taskflow API call made as that person). It can also
*propose* tasks; nothing is created until the person confirms in the app.

Not signed in (landing page): answers questions about Taskflow itself, no data.
"""
import json
import time
from collections import defaultdict, deque

from .. import config
from ..backend import BackendError, Ctx
from ..common import clip, compact_task, context_line, person_name
from ..llm import AIError, chat

MAX_ROUNDS = 5          # tool rounds per question
MAX_HISTORY = 12        # earlier messages kept from the conversation
TOOL_RESULT_CHARS = 6000

PRODUCT_FACTS = """#feature: public_chat
You are the assistant on Taskflow's website. Taskflow is a work tracker that grows from one person to a whole company.
What it does:
- Personal: log what you got done ("dones"), a board, calendar, goals, streaks, reminders, reports. Personal dones are always private.
- Companies: one person can be in many companies. Roles: Owner, Admin, Manager, Member, Guest (only shared projects), Viewer (read-only).
- Structure: departments, teams and sub-teams, org chart, people directory with skills.
- Work: assign tasks, reviewers, watchers, subtasks, checklists, "waits for" links, project boards with custom columns, an inbox across companies.
- Company life: invites, join by email domain, onboarding checklists, team moves with approval, announcements, offboarding hand-over, audit log.
- Collaboration: meetings with agendas, notes, decisions and action items that become tasks; private 1:1s; retros; project status updates; decision log; wiki.
- People: time off with approval, who's away, workload view, analytics.
- AI helpers: break tasks down, suggest owners, meeting notes to action items, status drafts, ask the wiki, and "solve a team problem".
- Integrations: email, Slack, browser notifications, SMS, Google Calendar, GitHub, Jira.
It's free right now. To start: sign up, then create a company or keep using it personally.
Be brief, friendly and accurate. If you don't know something about Taskflow, say so; never invent prices or features. You can't see anyone's data here."""

ASSISTANT_SYSTEM = """#feature: chat
You are Taskflow's assistant, helping one person with their work. {context}
Use the tools to look things up before answering questions about tasks, people, meetings, projects, decisions, time off or the wiki — never guess numbers or names.
Rules:
- You only see what this person is allowed to see. Personal dones of other people are never visible to anyone; don't speculate about them.
- Keep answers short and practical. Use plain language, short lists when helpful, and mention task titles (not ids).
- To create work, call propose_tasks. That only *suggests* tasks; the person confirms them in the app. Never claim you created or changed anything.
- If a tool says something isn't allowed or doesn't exist, say so plainly.
- If you're asked for something outside Taskflow (general knowledge, writing help), you may help briefly."""


def _fn(name, description, properties=None, required=None):
    return {"type": "function", "function": {
        "name": name, "description": description,
        "parameters": {"type": "object", "properties": properties or {}, "required": required or []},
    }}


COMMON_TOOLS = [
    _fn("get_my_inbox", "Open work assigned to me, waiting for my review, or that I watch — across all my companies."),
    _fn("list_tasks", "Tasks in the current workspace for a date range (by the day they were logged/planned).",
        {"start": {"type": "string", "description": "YYYY-MM-DD"}, "end": {"type": "string", "description": "YYYY-MM-DD"},
         "open_only": {"type": "boolean", "description": "only tasks not done yet"}}),
    _fn("search_tasks", "Search tasks by words in the title or description.",
        {"query": {"type": "string"}, "status": {"type": "string", "enum": ["Doing", "Delayed", "Done"]}}, ["query"]),
    _fn("get_task", "Everything about one task: people, subtasks, checklist, what it waits for.",
        {"task_id": {"type": "integer"}}, ["task_id"]),
    _fn("propose_tasks", "Suggest new tasks for the person to confirm (nothing is created until they confirm).",
        {"tasks": {"type": "array", "items": {"type": "object", "properties": {
            "title": {"type": "string"}, "description": {"type": "string"},
            "assignee_name": {"type": "string", "description": "a person's name, if it should go to someone"},
            "due_date": {"type": "string", "description": "YYYY-MM-DD"},
            "priority": {"type": "string", "enum": ["low", "medium", "high", "urgent"]}}, "required": ["title"]}}},
        ["tasks"]),
]

COMPANY_TOOLS = [
    _fn("get_people", "People in the company: role, job title, department, manager, skills, teams."),
    _fn("get_workload", "Open work per person (open, due this week, overdue, reviews, days away).",
        {"team_name": {"type": "string"}}),
    _fn("get_analytics", "Company numbers: finished/added per week, days to finish, on-time rate, by team/project/person.",
        {"days": {"type": "integer", "enum": [30, 90, 180, 365]}}),
    _fn("get_project_updates", "Each project's latest health (on track / at risk / off track) and summary."),
    _fn("get_meetings", "My meetings in a date range.",
        {"start": {"type": "string", "description": "YYYY-MM-DD"}, "end": {"type": "string", "description": "YYYY-MM-DD"}}),
    _fn("search_decisions", "Search the decision log.", {"query": {"type": "string"}}),
    _fn("search_wiki", "Search wiki pages; returns titles and snippets.", {"query": {"type": "string"}}, ["query"]),
    _fn("read_wiki_page", "Read one wiki page in full.", {"page_id": {"type": "string"}}, ["page_id"]),
    _fn("get_time_off", "Who is away and when (and my own requests)."),
    _fn("get_announcements", "Recent company announcements."),
]


def tools_for(ctx: Ctx) -> list:
    return COMMON_TOOLS + (COMPANY_TOOLS if ctx.company else [])


async def run_tool(ctx: Ctx, name: str, args: dict, proposals: list) -> object:
    b, cid = ctx.backend, ctx.company_id
    if name == "get_my_inbox":
        box = await b.get("/tasks/inbox")
        return {k: [compact_task(t) for t in v[:25]] for k, v in box.items()}
    if name == "list_tasks":
        params = {"start": args.get("start"), "end": args.get("end")}
        if not (params["start"] and params["end"]):
            params = {"open": 1}
        rows = await b.get("/tasks", **params)
        if args.get("open_only"):
            rows = [t for t in rows if t.get("status") != "Done"]
        return [compact_task(t) for t in rows[:60]]
    if name == "search_tasks":
        rows = await b.get("/tasks/search", q=args.get("query"), status=args.get("status"))
        return [compact_task(t) for t in rows[:40]]
    if name == "get_task":
        t = await b.get(f"/tasks/{int(args.get('task_id'))}")
        return {**compact_task(t), "description": clip(t.get("description"), 800),
                "reviewer": person_name(t.get("reviewer")), "subtasks": [compact_task(s) for s in t.get("subtasks", [])],
                "checklist": [{"text": i["title"], "done": i["done"]} for i in t.get("checklist", [])],
                "waits_for": [compact_task(s) for s in t.get("blocked_by", [])]}
    if name == "propose_tasks":
        items = [x for x in (args.get("tasks") or []) if isinstance(x, dict) and str(x.get("title", "")).strip()][:15]
        proposals.extend(items)
        return {"ok": True, "note": f"{len(items)} task(s) shown to the person to confirm. They are NOT created yet."}
    if not cid:
        return {"error": "That needs a company workspace — the person is in Personal."}
    if name == "get_people":
        org = await b.get(f"/companies/{cid}/org")
        teams = {t["id"]: t["name"] for t in org.get("teams", [])}
        depts = {d["id"]: d["name"] for d in org.get("departments", [])}
        names = {p["id"]: person_name(p) for p in org.get("people", [])}
        return [{"name": person_name(p), "role": p.get("role"), "title": p.get("job_title"), "level": p.get("level"),
                 "department": depts.get(p.get("department_id")), "manager": names.get(p.get("manager_id")),
                 "skills": p.get("skills") or [], "teams": [teams.get(t) for t in p.get("team_ids", [])]}
                for p in org.get("people", [])][:150]
    if name == "get_workload":
        team_id = None
        if args.get("team_name"):
            org = await b.get(f"/companies/{cid}/org")
            team = next((t for t in org.get("teams", []) if t["name"].lower() == args["team_name"].lower()), None)
            if not team:
                return {"error": f'No team called "{args["team_name"]}" that you can see'}
            team_id = team["id"]
        w = await b.get(f"/companies/{cid}/workload", team_id=team_id)
        return [{k: p.get(k) for k in ("name", "open", "due_this_week", "overdue", "urgent", "reviews", "done_last_7",
                                       "away_this_week", "away_until", "load")} for p in w.get("people", [])]
    if name == "get_analytics":
        a = await b.get(f"/companies/{cid}/analytics", days=args.get("days") or 90)
        return {"range": a["range"], "totals": a["totals"], "weekly": a["weekly"][-8:],
                "teams": a["teams"][:15], "projects": a["projects"][:15], "people": a["people"][:30]}
    if name == "get_project_updates":
        rows = await b.get(f"/companies/{cid}/updates")
        return [{"project": p["name"], "team": p.get("team_name"),
                 "health": (p.get("latest") or {}).get("health"), "summary": clip((p.get("latest") or {}).get("summary"), 300),
                 "risks": clip((p.get("latest") or {}).get("risks"), 200), "updated": ((p.get("latest") or {}).get("created_at") or "")[:10]}
                for p in rows][:40]
    if name == "get_meetings":
        rows = await b.get("/meetings", **{"from": args.get("start"), "to": args.get("end")})
        return [{"id": m["id"], "title": m["title"], "kind": m["kind"], "starts_at": m["starts_at"], "status": m["status"],
                 "people": [person_name(a) for a in m.get("attendees", [])][:12]} for m in rows][:40]
    if name == "search_decisions":
        rows = await b.get("/decisions", q=args.get("query"))
        return [{"title": d["title"], "status": d["status"], "date": d["decided_on"], "context": clip(d.get("context"), 300)}
                for d in rows][:30]
    if name == "search_wiki":
        rows = await b.get("/wiki", q=args.get("query"))
        return [{"page_id": p["id"], "title": p["title"], "space": p.get("team_name") or "Company",
                 "snippet": clip(p.get("snippet"), 300)} for p in rows][:10]
    if name == "read_wiki_page":
        p = await b.get(f"/wiki/{args.get('page_id')}")
        return {"title": p["title"], "body": clip(p.get("body"), 5000), "updated": (p.get("updated_at") or "")[:10]}
    if name == "get_time_off":
        rows = await b.get(f"/companies/{cid}/time-off")
        return [{"person": person_name(t.get("person")), "from": t["start_date"], "to": t["end_date"],
                 "status": t["status"], "kind": t.get("kind")} for t in rows][:60]
    if name == "get_announcements":
        rows = await b.get(f"/companies/{cid}/announcements")
        return [{"title": a["title"], "body": clip(a.get("body"), 300), "date": a["created_at"][:10]} for a in rows][:15]
    return {"error": f"Unknown tool {name}"}


def _history(messages: list) -> list:
    out = []
    for m in (messages or [])[-MAX_HISTORY:]:
        role = m.get("role")
        text = str(m.get("text") or m.get("content") or "").strip()
        if role in ("user", "assistant") and text:
            out.append({"role": role, "content": clip(text, 4000)})
    return out


async def answer(ctx: Ctx, message: str, history: list) -> dict:
    """One question, answered with as many look-ups as needed."""
    messages = [{"role": "system", "content": ASSISTANT_SYSTEM.format(context=context_line(ctx))}]
    messages += _history(history)
    messages.append({"role": "user", "content": clip(message, 4000)})

    proposals: list = []
    used = {"model": "", "tokens_in": 0, "tokens_out": 0}
    looked_up: list[str] = []
    reply = None
    for _ in range(MAX_ROUNDS):
        reply = await chat(messages, tools=tools_for(ctx), max_tokens=1200)
        used["model"] = reply.model
        used["tokens_in"] += reply.tokens_in
        used["tokens_out"] += reply.tokens_out
        if not reply.tool_calls:
            break
        messages.append({"role": "assistant", "content": reply.content or None, "tool_calls": reply.tool_calls})
        for call in reply.tool_calls[:6]:
            fn = call.get("function") or {}
            try:
                args = json.loads(fn.get("arguments") or "{}")
            except ValueError:
                args = {}
            try:
                result = await run_tool(ctx, fn.get("name", ""), args if isinstance(args, dict) else {}, proposals)
            except BackendError as err:
                result = {"error": err.message}
            except (KeyError, TypeError, ValueError):
                result = {"error": "That lookup failed"}
            looked_up.append(fn.get("name", ""))
            messages.append({"role": "tool", "tool_call_id": call.get("id"), "content": clip(json.dumps(result, default=str), TOOL_RESULT_CHARS)})
    else:
        # ran out of rounds: ask for a final answer without tools
        reply = await chat(messages + [{"role": "user", "content": "Answer now with what you found."}], max_tokens=800)
        used["tokens_in"] += reply.tokens_in
        used["tokens_out"] += reply.tokens_out

    text = (reply.content if reply else "") or ("I've put some tasks below for you to confirm." if proposals else "Sorry, I couldn't find an answer.")
    await ctx.record("chat", type("R", (), used)())
    return {"response": text, "proposals": proposals, "looked_up": sorted(set(looked_up))}


# ── Landing page (no login) ─────────────────────────────────────────────────
_visits: dict[str, deque] = defaultdict(deque)


def public_allowed(ip: str) -> bool:
    now = time.time()
    q = _visits[ip]
    while q and now - q[0] > 3600:
        q.popleft()
    if len(q) >= config.PUBLIC_CHAT_PER_HOUR:
        return False
    q.append(now)
    return True


async def answer_public(message: str, history: list) -> str:
    messages = [{"role": "system", "content": PRODUCT_FACTS}] + _history(history)[-6:]
    messages.append({"role": "user", "content": clip(message, 1500)})
    try:
        reply = await chat(messages, max_tokens=500, temperature=0.4)
    except AIError as err:
        return f"Sorry — {err}."
    return reply.content or "Sorry, I couldn't process that."
