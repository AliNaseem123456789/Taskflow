"""'Solve a team problem' and the personal report summary.

Solve: the person describes what's going wrong ("releases keep slipping",
"Sara is drowning"). We gather the facts they're allowed to see — workload,
overdue and blocked work, project health, time off, recent decisions — and ask
for a diagnosis, a plan, and concrete tasks they can create with one click.

Summary: the Reports page's AI summary of your own tasks (same response shape
as the old service, but it now uses your login instead of a user id).
"""
import json
import re
from datetime import date

from fastapi import Depends, HTTPException
from pydantic import BaseModel, Field

from ..backend import BackendError, Ctx
from ..common import clip, compact_task, context_line, match_person, person_name
from ..llm import ask_json

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
PRIORITIES = {"low", "medium", "high", "urgent"}

SOLVE = """#feature: solve_problem
You are a practical team coach inside a work tracker. {context}
The person describes a problem with how work is going. Use ONLY the facts provided (workload, overdue/blocked tasks,
project health, time off, numbers, decisions) to explain what is most likely going on, then propose a short plan.
Be specific: name projects, tasks and people from the facts; never blame anyone; prefer small changes the team can make this week.
Return JSON with:
"diagnosis": 2-4 sentences;
"causes": up to 4 {{"cause", "evidence"}} (evidence = facts from the data);
"plan": 3-6 {{"step", "why"}};
"tasks": up to 6 concrete tasks {{"title" (starts with a verb), "assignee_name" (a person from the facts or null), "due_date" (YYYY-MM-DD or null), "priority", "description"}};
"questions": up to 3 questions worth asking the team;
"watch": up to 3 numbers to watch to know it's working."""


class SolveIn(BaseModel):
    problem: str = Field(min_length=5, max_length=2000)
    team_id: str | None = None
    project_id: str | None = None


async def _facts(ctx: Ctx, body: SolveIn) -> dict:
    """What the person can see that's relevant, kept small."""
    b, cid = ctx.backend, ctx.company_id
    today = date.today().isoformat()
    facts: dict = {"problem": body.problem}
    open_tasks = await b.get("/tasks", open=1, team_id=body.team_id, project_id=body.project_id)
    overdue = [t for t in open_tasks if t.get("due_date") and t["due_date"] < today]
    stuck = [t for t in open_tasks if t.get("blocker") or t.get("status") == "Delayed"]
    facts["open_work"] = {"count": len(open_tasks), "overdue": [compact_task(t) for t in overdue[:25]],
                          "blocked_or_delayed": [compact_task(t) for t in stuck[:15]],
                          "unassigned_or_no_due": sum(1 for t in open_tasks if not t.get("due_date"))}
    if not cid:
        return facts
    async def safe(coro, default=None):
        try:
            return await coro
        except BackendError:
            return default
    workload = await safe(b.get(f"/companies/{cid}/workload", team_id=body.team_id), {"people": []})
    facts["workload"] = [{k: p.get(k) for k in ("name", "open", "overdue", "due_this_week", "reviews", "done_last_7", "away_this_week", "away_until", "load")}
                         for p in workload.get("people", [])][:40]
    analytics = await safe(b.get(f"/companies/{cid}/analytics", days=90, team_id=body.team_id, project_id=body.project_id))
    if analytics:
        facts["numbers_90_days"] = {"totals": analytics["totals"], "last_weeks": analytics["weekly"][-6:],
                                    "projects": analytics["projects"][:12], "teams": analytics["teams"][:10]}
    updates = await safe(b.get(f"/companies/{cid}/updates"), [])
    facts["project_health"] = [{"project": p["name"], "health": (p.get("latest") or {}).get("health"),
                                "summary": clip((p.get("latest") or {}).get("summary"), 200), "risks": clip((p.get("latest") or {}).get("risks"), 200)}
                               for p in updates if p.get("latest")][:15]
    away = await safe(b.get(f"/companies/{cid}/time-off"), [])
    facts["time_off"] = [{"person": person_name(t.get("person")), "from": t["start_date"], "to": t["end_date"]}
                         for t in away if t["status"] == "approved" and t["end_date"] >= today][:20]
    decisions = await safe(b.get("/decisions"), [])
    facts["recent_decisions"] = [{"title": d["title"], "date": d["decided_on"], "status": d["status"]} for d in decisions[:10]]
    return facts


async def solve(ctx: Ctx, body: SolveIn) -> dict:
    facts = await _facts(ctx, body)
    people = []
    if ctx.company_id:
        org = await ctx.backend.get(f"/companies/{ctx.company_id}/org")
        people = [p for p in org.get("people", []) if p.get("role") not in ("viewer",)]
        facts["people"] = [{"name": person_name(p), "title": p.get("job_title"), "skills": p.get("skills") or []} for p in people][:80]
    data, reply = await ask_json(SOLVE.format(context=context_line(ctx)), json.dumps(facts, default=str), max_tokens=2200, temperature=0.3)
    await ctx.record("solve_problem", reply)

    def pairs(items, a, b, n):
        return [{a: clip(x.get(a), 400), b: clip(x.get(b), 400)} for x in (items or []) if isinstance(x, dict) and x.get(a)][:n]

    tasks = []
    for t in (data.get("tasks") or [])[:6]:
        if not isinstance(t, dict) or not str(t.get("title") or "").strip():
            continue
        who = match_person(t.get("assignee_name"), people) if people else None
        tasks.append({"title": clip(t["title"], 200), "description": clip(t.get("description"), 1000) or None,
                      "assignee_id": who["id"] if who else None, "assignee_name": person_name(who) or None,
                      "due_date": t.get("due_date") if DATE_RE.match(str(t.get("due_date") or "")) else None,
                      "priority": t.get("priority") if t.get("priority") in PRIORITIES else "medium"})
    return {
        "diagnosis": clip(data.get("diagnosis"), 1500),
        "causes": pairs(data.get("causes"), "cause", "evidence", 4),
        "plan": pairs(data.get("plan"), "step", "why", 6),
        "tasks": tasks,
        "questions": [clip(q, 300) for q in (data.get("questions") or []) if isinstance(q, str)][:3],
        "watch": [clip(w, 200) for w in (data.get("watch") or []) if isinstance(w, str)][:3],
        "facts_used": {"open_tasks": facts["open_work"]["count"], "overdue": len(facts["open_work"]["overdue"]),
                       "people": len(facts.get("workload", [])), "projects": len(facts.get("project_health", []))},
    }


# ── Personal report summary (Reports page) ──────────────────────────────────
SUMMARY = """#feature: summary
Summarise one person's own work for a period, kindly and concretely. {context}
Return "summary" (2-3 sentences), "recommendations": 2-4 {{"title" (2-4 words), "text" (one sentence)}} based on the tasks
(e.g. focus on delayed items, break up big ones, protect streaks). JSON keys: summary, recommendations."""


class SummaryIn(BaseModel):
    start_date: str
    end_date: str
    user_id: str | None = None  # accepted for the old frontend, ignored: we use your login


async def summary(ctx: Ctx, body: SummaryIn) -> dict:
    if not (DATE_RE.match(body.start_date) and DATE_RE.match(body.end_date)):
        raise HTTPException(400, "Dates must look like 2026-10-01")
    # always the person's own view (Personal: their private tasks + work assigned to them)
    tasks = await ctx.backend.request("GET", "/tasks", params={"start": body.start_date, "end": body.end_date}, company="")
    dones = [t for t in tasks if t.get("status") == "Done"]
    doing = [t for t in tasks if t.get("status") == "Doing"]
    delayed = [t for t in tasks if t.get("status") == "Delayed"]
    stats = {"total_tasks": len(tasks), "completion_rate": round(100 * len(dones) / len(tasks)) if tasks else 0,
             "delayed_count": len(delayed), "doing_count": len(doing), "done_count": len(dones)}
    insights = {"dones": [t["title"] for t in dones][:50], "doing": [t["title"] for t in doing][:50], "delayed": [t["title"] for t in delayed][:50]}
    if not tasks:
        return {"summary": "No tasks in this period yet.", "insights": insights, "recommendations": [], "stats": stats}
    data, reply = await ask_json(SUMMARY.format(context=context_line(ctx)), json.dumps({
        "period": [body.start_date, body.end_date], "stats": stats,
        "done": insights["dones"][:40], "doing": insights["doing"][:30], "delayed": insights["delayed"][:20],
    }), max_tokens=700)
    await ctx.record("summary", reply)
    recs = [{"title": clip(r.get("title"), 60), "text": clip(r.get("text"), 300)} for r in (data.get("recommendations") or [])
            if isinstance(r, dict) and r.get("text")][:4]
    return {"summary": clip(data.get("summary"), 1000), "insights": insights, "recommendations": recs, "stats": stats}


def add_routes(app, signed_in):
    @app.post("/api/solve")
    async def _solve(body: SolveIn, ctx: Ctx = Depends(signed_in)):
        return await solve(ctx, body)

    @app.post("/api/ai-summary")
    async def _summary(body: SummaryIn, ctx: Ctx = Depends(signed_in)):
        return await summary(ctx, body)
