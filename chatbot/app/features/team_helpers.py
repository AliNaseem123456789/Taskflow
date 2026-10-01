"""AI helpers for working together:
meeting notes → decisions and action items, retro themes, project status drafts,
standup / weekly report drafts, and answers from the wiki.
"""
import json
import re
from datetime import date, timedelta

from fastapi import Depends
from pydantic import BaseModel, Field

from ..backend import BackendError, Ctx
from ..common import clip, compact_task, context_line, match_person, person_name
from ..llm import ask_json

DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")
HEALTH = {"on_track", "at_risk", "off_track"}


def _lines(items, n=12, size=300):
    return [clip(str(x).strip(), size) for x in (items or []) if isinstance(x, str) and str(x).strip()][:n]


# ── Meeting notes → decisions and actions ───────────────────────────────────
EXTRACT = """#feature: meeting_notes
You turn meeting notes into a clear record. {context}
From the agenda, notes and items already captured, return:
"summary" (3-5 sentences), "decisions" (what was agreed, short sentences),
"actions" (each {{"text": starts with a verb, "owner_name": one of the attendees or null, "due_date": YYYY-MM-DD or null}}),
"open_questions" (things left unresolved).
Only include things actually in the notes. Skip anything already captured. JSON keys: summary, decisions, actions, open_questions."""


class MeetingIn(BaseModel):
    meeting_id: str


async def meeting_notes(ctx: Ctx, body: MeetingIn) -> dict:
    m = await ctx.backend.get(f"/meetings/{body.meeting_id}")
    attendees = m.get("attendees", [])
    if not (m.get("notes") or "").strip() and not any(i["kind"] in ("topic", "decision", "action") for i in m.get("items", [])):
        return {"summary": "", "decisions": [], "actions": [], "open_questions": [], "note": "Write some notes first."}
    prompt = json.dumps({
        "title": m["title"], "kind": m["kind"], "date": m["starts_at"][:10],
        "attendees": [person_name(a) for a in attendees],
        "agenda": clip(m.get("agenda"), 3000), "notes": clip(m.get("notes"), 12000),
        "already_captured": [{"kind": i["kind"], "text": i["text"]} for i in m.get("items", []) if i["kind"] in ("decision", "action")],
        "talking_points": [i["text"] for i in m.get("items", []) if i["kind"] == "topic"],
    })
    data, reply = await ask_json(EXTRACT.format(context=context_line(ctx)), prompt, max_tokens=1500)
    await ctx.record("meeting_notes", reply)
    actions = []
    for a in (data.get("actions") or [])[:15]:
        if not isinstance(a, dict) or not str(a.get("text") or "").strip():
            continue
        who = match_person(a.get("owner_name"), attendees)
        actions.append({"text": clip(a["text"], 300), "assignee_id": who["id"] if who else None,
                        "assignee_name": person_name(who) or None,
                        "due_date": a.get("due_date") if DATE_RE.match(str(a.get("due_date") or "")) else None})
    return {"summary": clip(data.get("summary"), 1500), "decisions": _lines(data.get("decisions")),
            "actions": actions, "open_questions": _lines(data.get("open_questions"), 8)}


# ── Retro themes ─────────────────────────────────────────────────────────────
RETRO = """#feature: retro_themes
You help a team make sense of their retrospective. {context}
Group the cards into 2-6 themes. For each theme: "name" (2-5 words), "card_ids" (ids of its cards), "tone" ("good", "bad" or "mixed").
Then suggest up to 4 "actions" the team could take next sprint, each {{"text": starts with a verb, "owner_name": an attendee or null}},
focusing on the most-voted problems. JSON keys: themes, actions."""


async def retro_themes(ctx: Ctx, body: MeetingIn) -> dict:
    m = await ctx.backend.get(f"/meetings/{body.meeting_id}")
    cards = [i for i in m.get("items", []) if i["kind"] in ("went_well", "to_improve", "idea")]
    if len(cards) < 2:
        return {"themes": [], "actions": [], "note": "Add a few cards first."}
    attendees = m.get("attendees", [])
    prompt = json.dumps({
        "attendees": [person_name(a) for a in attendees],
        "cards": [{"id": c["id"], "column": c["kind"], "text": clip(c["text"], 300), "votes": c.get("vote_count", 0)} for c in cards][:120],
    })
    data, reply = await ask_json(RETRO.format(context=context_line(ctx)), prompt, max_tokens=1500)
    await ctx.record("retro_themes", reply)
    by_id = {c["id"]: c for c in cards}
    themes = []
    for t in (data.get("themes") or [])[:6]:
        if not isinstance(t, dict):
            continue
        ids = [i for i in (t.get("card_ids") or []) if i in by_id]
        if not ids:
            continue
        themes.append({"name": clip(t.get("name"), 60), "tone": t.get("tone") if t.get("tone") in ("good", "bad", "mixed") else "mixed",
                       "cards": [by_id[i]["text"] for i in ids], "votes": sum(by_id[i].get("vote_count", 0) for i in ids)})
    actions = []
    for a in (data.get("actions") or [])[:4]:
        if isinstance(a, dict) and str(a.get("text") or "").strip():
            who = match_person(a.get("owner_name"), attendees)
            actions.append({"text": clip(a["text"], 300), "assignee_id": who["id"] if who else None, "assignee_name": person_name(who) or None})
    return {"themes": sorted(themes, key=lambda t: -t["votes"]), "actions": actions}


# ── Project status draft ─────────────────────────────────────────────────────
PROJECT = """#feature: project_update
Draft a project status update for the team lead to edit. {context}
Use the numbers, the board (columns, overdue and waiting cards) and earlier updates.
"health": on_track / at_risk / off_track (off_track if much is overdue or blocked with no recovery; at_risk if slipping);
"summary": 1-2 sentences; "highlights", "risks", "next_steps": short plain text (a few lines each, may be empty).
Be factual; don't invent work that isn't in the data. JSON keys: health, summary, highlights, risks, next_steps."""


class ProjectIn(BaseModel):
    team_id: str
    project_id: str


async def project_update(ctx: Ctx, body: ProjectIn) -> dict:
    base = f"/teams/{body.team_id}/projects/{body.project_id}"
    updates = await ctx.backend.get(f"{base}/updates")
    board = await ctx.backend.get(f"{base}/board")
    cols = {s["id"]: s["name"] for s in board.get("statuses", [])}
    today = date.today().isoformat()
    cards = [{"title": clip(t["title"], 120), "column": cols.get(t.get("column_id")), "assignee": person_name(t.get("assignee")),
              "due": t.get("due_date"), "overdue": bool(t.get("due_date") and t["due_date"] < today and t["status"] != "Done"),
              "waiting": t.get("blocked"), "priority": t.get("priority")} for t in board.get("tasks", [])][:80]
    prompt = json.dumps({
        "project": (board.get("project") or {}).get("name"), "numbers_now": updates.get("current"),
        "board": cards,
        "earlier_updates": [{"date": u["created_at"][:10], "health": u["health"], "summary": clip(u["summary"], 300),
                             "next_steps": clip(u.get("next_steps"), 300)} for u in updates.get("updates", [])[:3]],
    })
    data, reply = await ask_json(PROJECT.format(context=context_line(ctx)), prompt, max_tokens=1000)
    await ctx.record("project_update", reply)
    return {"health": data.get("health") if data.get("health") in HEALTH else "on_track",
            "summary": clip(data.get("summary"), 1000), "highlights": clip(data.get("highlights"), 1500),
            "risks": clip(data.get("risks"), 1500), "next_steps": clip(data.get("next_steps"), 1500),
            "can_post": updates.get("can_post", False)}


# ── Standup / weekly report ──────────────────────────────────────────────────
STANDUP = """#feature: standup
Write a {kind} for the person, in first person, short and specific. {context}
Use only the tasks given (finished, in progress, waiting, overdue). Group small items; mention blockers plainly.
{shape}"""
SHAPES = {
    "standup": 'JSON keys: "yesterday", "today", "blockers" — each a few lines of "• " bullets (blockers may be "").',
    "weekly": 'JSON keys: "done", "in_progress", "next", "blockers", "highlight" — bullets ("• ") except highlight (one sentence).',
}


class StandupIn(BaseModel):
    kind: str = Field(default="standup", pattern="^(standup|weekly)$")
    team_id: str | None = None


async def standup(ctx: Ctx, body: StandupIn) -> dict:
    facts: dict = {}
    if body.team_id:
        facts["plain_draft"] = await ctx.backend.get(f"/teams/{body.team_id}/standups/draft")
    days = 7 if body.kind == "weekly" else 2
    end = date.today()
    start = end - timedelta(days=days)
    me = ctx.user["id"]
    tasks = [t for t in await ctx.backend.get("/tasks", start=start.isoformat(), end=end.isoformat())
             if t.get("assignee_id") == me or (not t.get("company_id") and t.get("user_id") == me)]  # only my own work
    box = await ctx.backend.get("/tasks/inbox")
    facts["finished"] = [compact_task(t) for t in tasks if t.get("status") == "Done"][:40]
    facts["in_progress"] = [compact_task(t) for t in box.get("assigned", []) if t.get("status") != "Done"][:30]
    facts["waiting_for_my_review"] = [compact_task(t) for t in box.get("reviewing", [])][:10]
    facts["blocked"] = [compact_task(t) for t in tasks + box.get("assigned", []) if t.get("blocker") or t.get("status") == "Delayed"][:10]
    if not any(facts.get(k) for k in ("finished", "in_progress", "blocked")) and not facts.get("plain_draft"):
        return {"kind": body.kind, "empty": True}
    data, reply = await ask_json(STANDUP.format(kind="daily standup" if body.kind == "standup" else "weekly report",
                                                context=context_line(ctx), shape=SHAPES[body.kind]),
                                 json.dumps(facts, default=str), max_tokens=900)
    await ctx.record("standup", reply)
    keys = ["yesterday", "today", "blockers"] if body.kind == "standup" else ["done", "in_progress", "next", "blockers", "highlight"]
    return {"kind": body.kind, **{k: clip(data.get(k), 2000) for k in keys}}


# ── Ask the wiki ─────────────────────────────────────────────────────────────
WIKI = """#feature: wiki_answer
Answer a question using ONLY the wiki pages given. {context}
If the pages don't contain the answer, set "found" to false and say briefly what is missing.
"answer": a short, direct answer (Markdown allowed); "sources": ids of the pages you used; "found": true/false.
JSON keys: answer, sources, found."""
STOP = set("the a an and or of to in on for with is are was what how who when where which do does can i we our my you it this that".split())


class WikiIn(BaseModel):
    question: str = Field(min_length=3, max_length=500)


async def ask_wiki(ctx: Ctx, body: WikiIn) -> dict:
    if not ctx.company_id:
        return {"answer": "The wiki lives in a company — switch to one first.", "sources": [], "found": False}
    words = [w for w in re.findall(r"[\w']+", body.question.lower()) if w not in STOP and len(w) > 2][:8]
    hits = await ctx.backend.get("/wiki", q=" ".join(words)) if words else []
    # rank: more question words in title/snippet first
    def score(p):
        text = f'{p["title"]} {p.get("snippet", "")}'.lower()
        return sum(2 if w in p["title"].lower() else 1 for w in words if w in text)
    hits = sorted(hits, key=score, reverse=True)[:4]
    if not hits:
        return {"answer": "I couldn't find a wiki page about that.", "sources": [], "found": False}
    pages = []
    for h in hits:
        try:
            p = await ctx.backend.get(f"/wiki/{h['id']}")
            pages.append({"id": p["id"], "title": p["title"], "body": clip(p.get("body"), 6000)})
        except BackendError:
            continue
    data, reply = await ask_json(WIKI.format(context=context_line(ctx)),
                                 json.dumps({"question": body.question, "pages": pages}), max_tokens=900)
    await ctx.record("wiki_answer", reply)
    titles = {p["id"]: p["title"] for p in pages}
    sources = [{"id": s, "title": titles[s]} for s in (data.get("sources") or []) if s in titles]
    return {"answer": clip(data.get("answer"), 3000) or "No answer.", "sources": sources, "found": bool(data.get("found")) and bool(sources)}


def add_routes(app, signed_in):
    @app.post("/api/meetings/extract")
    async def _extract(body: MeetingIn, ctx: Ctx = Depends(signed_in)):
        return await meeting_notes(ctx, body)

    @app.post("/api/meetings/retro-themes")
    async def _retro(body: MeetingIn, ctx: Ctx = Depends(signed_in)):
        return await retro_themes(ctx, body)

    @app.post("/api/projects/update-draft")
    async def _project(body: ProjectIn, ctx: Ctx = Depends(signed_in)):
        return await project_update(ctx, body)

    @app.post("/api/standup/draft")
    async def _standup(body: StandupIn, ctx: Ctx = Depends(signed_in)):
        return await standup(ctx, body)

    @app.post("/api/wiki/ask")
    async def _wiki(body: WikiIn, ctx: Ctx = Depends(signed_in)):
        return await ask_wiki(ctx, body)
