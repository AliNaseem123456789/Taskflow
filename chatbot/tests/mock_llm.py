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


# canned JSON answers for the one-shot features (filled in per step)
CANNED: dict = {}


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
