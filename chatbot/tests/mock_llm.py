"""A stand-in for Groq, for tests: an OpenAI-compatible /chat/completions that
answers by simple rules (keyed off the '#feature:' line each prompt starts with),
so the whole flow can be tested without a key or network.

Run: uvicorn tests.mock_llm:app --port 8899
"""
import json

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

app = FastAPI()
LOG: list[dict] = []


def reply(content="", tool_calls=None, model="mock-main"):
    msg = {"role": "assistant", "content": content}
    if tool_calls:
        msg["tool_calls"] = tool_calls
    return {"model": model, "choices": [{"message": msg}], "usage": {"prompt_tokens": 100, "completion_tokens": 20}}


def call(name, args):
    return [{"id": f"call_{name}", "type": "function", "function": {"name": name, "arguments": json.dumps(args)}}]


def feature_of(messages):
    system = next((m["content"] for m in messages if m["role"] == "system"), "")
    first = system.splitlines()[0] if system else ""
    return first.replace("#feature:", "").strip()


def _payload(user):
    try:
        return json.loads(user)
    except ValueError:
        return {}


def _breakdown(_m, user):
    p = _payload(user)
    first = (p.get("people") or [{}])[0].get("name")
    return {"subtasks": [{"title": "Draft the outline", "assignee_name": first, "days_from_now": 2},
                         {"title": "Review with the team", "days_from_now": 5}, {"title": ""}],
            "checklist": ["Check spelling", 7], "notes": "Start with the outline."}


def _parse(_m, user):
    p = _payload(user)
    s = p.get("sentence", "").lower()
    return {"title": "Update the deploy runbook", "description": None, "due_date": "2026-10-09",
            "priority": "urgent" if "asap" in s else "high", "assignee_name": "bo" if "bo" in s else "Nobody Real",
            "team_name": None, "project_name": (p.get("projects") or ["Ghost project"])[0], "recurrence": "sometimes"}


def _assign(_m, user):
    p = _payload(user)
    names = [c["name"] for c in p.get("candidates", [])]
    if "NOMATCH" in json.dumps(p):
        return {"suggestions": [{"name": "Somebody Else", "reason": "x"}]}
    return {"suggestions": [{"name": n, "reason": f"{n} fits"} for n in names[:2]] + [{"name": "Outsider X", "reason": "no"}]}


def _handover(_m, user):
    p = _payload(user)
    tasks = p.get("open_tasks", [])
    others = [x["name"] for x in p.get("people", [])]
    return {"summary": f"{p.get('person', {}).get('name')} has {len(tasks)} open tasks.",
            "tasks": [{"task_id": t["id"], "state": "half done", "next_step": "finish it", "suggested_owner": others[0] if others else None}
                      for t in tasks] + [{"task_id": 999999999, "state": "fake"}],
            "risks": ["Deadline on Friday"], "talk_to": others[:1]}


# canned JSON answers for the one-shot features
CANNED: dict = {"breakdown": _breakdown, "quick_add": _parse, "suggest_assignee": _assign, "handover": _handover}


@app.get("/log")
def log():
    return LOG[-20:]


@app.post("/v1/chat/completions")
async def completions(request: Request):
    body = await request.json()
    LOG.append(body)
    messages = body["messages"]
    feature = feature_of(messages)
    user = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "") or ""

    if "RATE_LIMIT" in user and body["model"] == "main-model":
        return JSONResponse({"error": {"message": "rate limited"}}, status_code=429)

    if feature == "public_chat":
        return reply("Taskflow tracks your work, from personal dones to whole companies. It's free right now.")

    if feature == "chat":
        tool_msgs = [m for m in messages if m["role"] == "tool"]
        if body.get("tools") and not tool_msgs:
            low = user.lower()
            if "inbox" in low or "my work" in low:
                return reply(tool_calls=call("get_my_inbox", {}), model=body["model"])
            if "workload" in low or "busy" in low:
                return reply(tool_calls=call("get_workload", {}), model=body["model"])
            if "handbook" in low or "wiki" in low:
                return reply(tool_calls=call("search_wiki", {"query": "handbook"}), model=body["model"])
            if "search" in low:
                return reply(tool_calls=call("search_tasks", {"query": user.split()[-1]}), model=body["model"])
            if "create" in low or "plan" in low:
                return reply(tool_calls=call("propose_tasks", {"tasks": [
                    {"title": "Write the launch email", "assignee_name": "Bo", "due_date": "2026-10-09", "priority": "high"},
                    {"title": "Book the venue"}]}), model=body["model"])
        if tool_msgs:
            return reply("Here's what I found: " + tool_msgs[-1]["content"][:1500], model=body["model"])
        return reply("Hello! Ask me about your work.", model=body["model"])

    if feature in CANNED:
        value = CANNED[feature](messages, user) if callable(CANNED[feature]) else CANNED[feature]
        return reply(json.dumps(value), model=body["model"])

    return reply("{}", model=body["model"])
