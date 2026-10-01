"""Small helpers shared by the AI features."""
from datetime import datetime
from zoneinfo import ZoneInfo


def today_for(user: dict) -> str:
    """Today's date where the person is (falls back to UTC)."""
    try:
        tz = ZoneInfo(user.get("timezone") or "UTC")
    except Exception:  # unknown zone name
        tz = ZoneInfo("UTC")
    now = datetime.now(tz)
    return now.strftime("%Y-%m-%d (%A)")


def context_line(ctx) -> str:
    """Who / where / when, for the top of every prompt."""
    where = f'the company "{ctx.company["name"]}" (their role: {ctx.company["role"]})' if ctx.company else "their Personal space (private tasks only)"
    return f'The person is {ctx.user.get("name") or ctx.user.get("email")}, working in {where}. Today is {today_for(ctx.user)}.'


def person_name(p: dict | None) -> str:
    if not p:
        return ""
    return p.get("name") or p.get("email") or ""


def clip(text, n: int) -> str:
    text = str(text or "")
    return text if len(text) <= n else text[: n - 1] + "…"


def compact_task(t: dict) -> dict:
    """The few task fields the model needs (keeps prompts small)."""
    out = {"id": t.get("id"), "title": clip(t.get("title"), 160), "status": t.get("status")}
    for key in ("priority", "due_date", "date_logged"):
        if t.get(key):
            out[key] = t[key]
    assignee = t.get("assignee") or {}
    if assignee:
        out["assignee"] = person_name(assignee)
    if (t.get("project") or {}).get("name"):
        out["project"] = t["project"]["name"]
    if t.get("blocker"):
        out["blocker"] = clip(t["blocker"], 160)
    if (t.get("company") or {}).get("name"):
        out["company"] = t["company"]["name"]
    return out


def match_person(name: str, people: list[dict]) -> dict | None:
    """Find a person from a name the model wrote ("Sara", "sara k", an email)."""
    name = (name or "").strip().lower()
    if not name:
        return None
    for p in people:
        if name in ((p.get("email") or "").lower(), (p.get("name") or "").lower()):
            return p
    for p in people:
        full = (p.get("name") or "").lower()
        if full and (full.startswith(name) or name in full.split() or name.split()[0] == full.split()[0]):
            return p
    for p in people:
        if (p.get("email") or "").lower().startswith(name):
            return p
    return None
