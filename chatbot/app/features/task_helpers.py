"""AI helpers on tasks and people:
break a task down, turn a sentence into a task, suggest who should do it,
and write a hand-over note for someone moving or leaving.
Every suggestion comes back for the person to confirm in the app.
"""
import json
import re

from fastapi import Depends
from pydantic import BaseModel, Field

from ..backend import BackendError, Ctx
from ..common import clip, compact_task, context_line, match_person, person_name
from ..llm import ask_json

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
PRIORITIES = {"low", "medium", "high", "urgent"}
RECURRENCES = {"daily", "weekdays", "weekly", "monthly"}


def _date(v):
    return v if isinstance(v, str) and DATE_RE.match(v) else None


async def _people(ctx: Ctx) -> list[dict]:
    """People the person can see in this company (empty in Personal)."""
    if not ctx.company_id:
        return []
    org = await ctx.backend.get(f"/companies/{ctx.company_id}/org")
    teams = {t["id"]: t["name"] for t in org.get("teams", [])}
    return [{"id": p["id"], "name": p.get("name"), "email": p.get("email"), "role": p.get("role"),
             "title": p.get("job_title"), "skills": p.get("skills") or [],
             "teams": [teams.get(t) for t in p.get("team_ids", []) if teams.get(t)]}
            for p in org.get("people", []) if p.get("role") not in ("viewer",)]


# ── Break a task down ────────────────────────────────────────────────────────
BREAKDOWN = """#feature: breakdown
You help break a piece of work into smaller steps. {context}
Given a task, propose:
- "subtasks": 2-8 real pieces of work, each with "title" (start with a verb, under 80 chars), optional "assignee_name"
  (only names from the people list, only when someone's skills clearly fit), optional "days_from_now" (integer, for a due date);
- "checklist": 0-8 small ticks that don't deserve their own task (e.g. "Check copy for typos");
- "notes": one short sentence on the approach or a risk.
Don't repeat subtasks or checklist items that already exist. JSON keys: subtasks, checklist, notes."""


class TaskIn(BaseModel):
    task_id: int


async def breakdown(ctx: Ctx, body: TaskIn) -> dict:
    task = await ctx.backend.get(f"/tasks/{body.task_id}")
    people = await _people(ctx) if task.get("company_id") and task.get("company_id") == ctx.company_id else []
    prompt = json.dumps({
        "task": {**compact_task(task), "description": clip(task.get("description"), 1500)},
        "existing_subtasks": [s["title"] for s in task.get("subtasks", [])],
        "existing_checklist": [i["title"] for i in task.get("checklist", [])],
        "people": [{"name": person_name(p), "title": p["title"], "skills": p["skills"]} for p in people][:60],
    })
    data, reply = await ask_json(BREAKDOWN.format(context=context_line(ctx)), prompt)
    await ctx.record("breakdown", reply)
    subtasks = []
    for s in (data.get("subtasks") or [])[:8]:
        title = clip(str((s or {}).get("title") or "").strip(), 200) if isinstance(s, dict) else ""
        if not title:
            continue
        who = match_person(s.get("assignee_name"), people) if people else None
        days = s.get("days_from_now")
        subtasks.append({"title": title, "assignee_id": who["id"] if who else None, "assignee_name": person_name(who) or None,
                         "days_from_now": int(days) if isinstance(days, (int, float)) and 0 <= days <= 365 else None})
    checklist = [clip(str(c).strip(), 200) for c in (data.get("checklist") or []) if isinstance(c, str) and c.strip()][:8]
    return {"task_id": task["id"], "subtasks": subtasks, "checklist": checklist, "notes": clip(data.get("notes"), 400)}


# ── A sentence → task fields ─────────────────────────────────────────────────
PARSE = """#feature: quick_add
Turn one sentence into a task. {context}
Work out: "title" (short, starts with a verb, without the date/person words), "description" (only if the sentence has extra detail),
"due_date" (YYYY-MM-DD, resolve words like "Friday", "tomorrow", "end of month" from today's date; null if none),
"priority" (low/medium/high/urgent; "asap"/"urgent" -> urgent; default medium),
"assignee_name" (who should do it, if a person is named; "me"/"I" -> null),
"team_name" and "project_name" (only if clearly named and in the lists given),
"recurrence" (daily/weekdays/weekly/monthly or null).
JSON keys: title, description, due_date, priority, assignee_name, team_name, project_name, recurrence."""


class ParseIn(BaseModel):
    text: str = Field(min_length=2, max_length=1000)


async def parse_task(ctx: Ctx, body: ParseIn) -> dict:
    people = await _people(ctx)
    projects, teams = [], []
    if ctx.company_id:
        projects = await ctx.backend.get("/teams/projects/mine")
        teams = await ctx.backend.get("/teams")
    prompt = json.dumps({
        "sentence": body.text,
        "people": [person_name(p) for p in people][:150],
        "teams": [t.get("name") for t in teams][:50],
        "projects": [p.get("name") for p in projects][:80],
    })
    data, reply = await ask_json(PARSE.format(context=context_line(ctx)), prompt, max_tokens=600)
    await ctx.record("quick_add", reply)

    title = clip(str(data.get("title") or "").strip(), 300) or clip(body.text, 300)
    out = {"title": title, "description": clip(data.get("description"), 2000) or None,
           "due_date": _date(data.get("due_date")),
           "priority": data.get("priority") if data.get("priority") in PRIORITIES else "medium",
           "recurrence": data.get("recurrence") if data.get("recurrence") in RECURRENCES else None,
           "assignee_id": None, "assignee_name": None, "team_id": None, "team_name": None,
           "project_id": None, "project_name": None, "unmatched": []}
    # names → ids, only among things this person can see
    if data.get("assignee_name"):
        who = match_person(data["assignee_name"], people)
        if who:
            out["assignee_id"], out["assignee_name"] = who["id"], person_name(who)
        else:
            out["unmatched"].append(f'person "{data["assignee_name"]}"')
    if data.get("project_name"):
        p = next((p for p in projects if p["name"].lower() == str(data["project_name"]).lower()), None)
        if p:
            out["project_id"], out["project_name"] = p["id"], p["name"]
        else:
            out["unmatched"].append(f'project "{data["project_name"]}"')
    if data.get("team_name") and not out["project_id"]:
        t = next((t for t in teams if t["name"].lower() == str(data["team_name"]).lower()), None)
        if t:
            out["team_id"], out["team_name"] = t["id"], t["name"]
        else:
            out["unmatched"].append(f'team "{data["team_name"]}"')
    return out


# ── Who should do it ─────────────────────────────────────────────────────────
ASSIGN = """#feature: suggest_assignee
Pick who should do a task. {context}
You get the task and candidates with job title, skills, teams and current load (open tasks, overdue, days away).
Prefer people whose skills/title fit, who are not stretched, and who are not away before the due date.
Return up to 3 "suggestions", best first, each with "name" (exactly as given) and "reason" (one short sentence, mention skills and load).
JSON keys: suggestions."""


class AssignIn(BaseModel):
    task_id: int | None = None
    title: str | None = Field(default=None, max_length=300)
    description: str | None = Field(default=None, max_length=3000)
    team_id: str | None = None
    due_date: str | None = None


def _score(p: dict, words: set) -> float:
    """Simple fallback ranking: skill/title matches minus load."""
    hits = sum(1 for w in words if any(w in s for s in p["skills"]) or w in (p.get("title") or "").lower())
    load = p.get("open", 0) + 2 * p.get("overdue", 0) + (5 if p.get("away_until") else 0)
    return hits * 3 - load * 0.5


async def suggest_assignee(ctx: Ctx, body: AssignIn) -> dict:
    if not ctx.company_id:
        return {"suggestions": [], "note": "Assigning is for company tasks."}
    title, description, team_id, due = body.title or "", body.description or "", body.team_id, body.due_date
    if body.task_id:
        task = await ctx.backend.get(f"/tasks/{body.task_id}")
        title, description = task.get("title") or title, task.get("description") or description
        team_id, due = task.get("team_id") or team_id, task.get("due_date") or due
    if not title:
        return {"suggestions": [], "note": "Give the task a title first."}

    people = await _people(ctx)
    try:
        load = (await ctx.backend.get(f"/companies/{ctx.company_id}/workload")).get("people", [])
    except BackendError:
        load = []
    by_id = {p["id"]: p for p in load}
    team_name = None
    if team_id:
        teams = await ctx.backend.get("/teams")
        team_name = next((t["name"] for t in teams if t["id"] == team_id), None)
    candidates = []
    for p in people:
        if p["role"] == "guest" or (team_name and team_name not in p["teams"] and len(people) > 8):
            continue  # big companies: stay inside the task's team
        w = by_id.get(p["id"], {})
        candidates.append({**p, "open": w.get("open", 0), "overdue": w.get("overdue", 0), "away_until": w.get("away_until"),
                           "load": w.get("load", "unknown")})
    if not candidates:
        return {"suggestions": [], "note": "Nobody to suggest."}

    prompt = json.dumps({
        "task": {"title": title, "description": clip(description, 1200), "due_date": due, "team": team_name},
        "candidates": [{"name": person_name(c), "title": c["title"], "skills": c["skills"], "teams": c["teams"],
                        "open_tasks": c["open"], "overdue": c["overdue"], "away_until": c["away_until"], "load": c["load"]}
                       for c in candidates][:60],
    })
    data, reply = await ask_json(ASSIGN.format(context=context_line(ctx)), prompt, max_tokens=600)
    await ctx.record("suggest_assignee", reply)
    out = []
    for s in (data.get("suggestions") or [])[:3]:
        who = match_person((s or {}).get("name"), candidates) if isinstance(s, dict) else None
        if who and who["id"] not in [o["user_id"] for o in out]:
            out.append({"user_id": who["id"], "name": person_name(who), "reason": clip(s.get("reason"), 240),
                        "load": who["load"], "open": who["open"], "away_until": who["away_until"]})
    if not out:  # the model's names didn't match anyone: fall back to a plain ranking
        words = {w for w in re.findall(r"[a-z]{3,}", f"{title} {description}".lower())}
        for c in sorted(candidates, key=lambda c: _score(c, words), reverse=True)[:3]:
            out.append({"user_id": c["id"], "name": person_name(c), "reason": f'{c["open"]} open tasks' + (", skills fit" if _score(c, words) > 0 else ""),
                        "load": c["load"], "open": c["open"], "away_until": c["away_until"]})
    return {"suggestions": out}


# ── Hand-over note ───────────────────────────────────────────────────────────
HANDOVER = """#feature: handover
Write a hand-over note for someone who is moving team or leaving, so their open work isn't dropped. {context}
You get their open tasks (with details) and tasks they review.
Return: "summary" (2-3 sentences: the state of their work), "tasks": for each open task {{"task_id", "state" (where it stands),
"next_step" (one concrete action), "suggested_owner" (a name from the people list, or null)}},
"risks" (list of short strings: deadlines, blockers, things only they know), "talk_to" (names of people they work with on this).
JSON keys: summary, tasks, risks, talk_to."""


class HandoverIn(BaseModel):
    user_id: str


async def handover(ctx: Ctx, body: HandoverIn) -> dict:
    if not ctx.company_id:
        return {"summary": "Hand-over notes are for company work.", "tasks": [], "risks": [], "talk_to": []}
    work = await ctx.backend.get(f"/companies/{ctx.company_id}/members/{body.user_id}/open-work")
    people = await _people(ctx)
    leaving = next((p for p in people if p["id"] == body.user_id), {})
    details = []
    for t in work.get("tasks", [])[:20]:
        try:
            full = await ctx.backend.get(f"/tasks/{t['id']}")
        except BackendError:
            continue
        details.append({**compact_task(full), "description": clip(full.get("description"), 400),
                        "checklist_left": [i["title"] for i in full.get("checklist", []) if not i["done"]][:8],
                        "waits_for": [s["title"] for s in full.get("blocked_by", [])][:5],
                        "subtasks_open": [s["title"] for s in full.get("subtasks", []) if s.get("status") != "Done"][:8],
                        "reviewer": person_name(full.get("reviewer")), "creator": person_name(full.get("creator"))})
    if not details:
        return {"summary": f"{person_name(leaving) or 'They'} have no open work to hand over.", "tasks": [], "risks": [], "talk_to": []}
    prompt = json.dumps({
        "person": {"name": person_name(leaving), "title": leaving.get("title"), "teams": leaving.get("teams")},
        "open_tasks": details, "reviews_waiting": work.get("reviewing", 0),
        "people": [{"name": person_name(p), "title": p["title"], "skills": p["skills"], "teams": p["teams"]}
                   for p in people if p["id"] != body.user_id][:60],
    })
    data, reply = await ask_json(HANDOVER.format(context=context_line(ctx)), prompt, max_tokens=1800)
    await ctx.record("handover", reply)
    titles = {d["id"]: d["title"] for d in details}
    tasks = []
    for t in data.get("tasks") or []:
        if not isinstance(t, dict) or t.get("task_id") not in titles:
            continue
        who = match_person(t.get("suggested_owner"), [p for p in people if p["id"] != body.user_id])
        tasks.append({"task_id": t["task_id"], "title": titles[t["task_id"]], "state": clip(t.get("state"), 300),
                      "next_step": clip(t.get("next_step"), 300),
                      "suggested_owner_id": who["id"] if who else None, "suggested_owner": person_name(who) or None})
    return {"person": person_name(leaving), "summary": clip(data.get("summary"), 1200), "tasks": tasks,
            "risks": [clip(r, 300) for r in (data.get("risks") or []) if isinstance(r, str)][:10],
            "talk_to": [clip(n, 80) for n in (data.get("talk_to") or []) if isinstance(n, str)][:10]}


def add_routes(app, signed_in):
    @app.post("/api/tasks/breakdown")
    async def _breakdown(body: TaskIn, ctx: Ctx = Depends(signed_in)):
        return await breakdown(ctx, body)

    @app.post("/api/tasks/parse")
    async def _parse(body: ParseIn, ctx: Ctx = Depends(signed_in)):
        return await parse_task(ctx, body)

    @app.post("/api/tasks/suggest-assignee")
    async def _assign(body: AssignIn, ctx: Ctx = Depends(signed_in)):
        return await suggest_assignee(ctx, body)

    @app.post("/api/people/handover")
    async def _handover(body: HandoverIn, ctx: Ctx = Depends(signed_in)):
        return await handover(ctx, body)
