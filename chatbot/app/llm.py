"""Talking to the model. Any OpenAI-compatible API (Groq by default).

`chat()` sends messages (optionally with tools) and returns the reply.
`ask_json()` asks for a JSON object and parses it, even if the model wraps it in prose.
When the main model is rate-limited or down, the fallback model is tried once.
"""
import asyncio
import json
import re
from dataclasses import dataclass, field

import httpx

from . import config


class AIError(Exception):
    """The model couldn't answer (no key, rate limit, outage, bad reply)."""

    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


@dataclass
class Reply:
    content: str = ""
    tool_calls: list = field(default_factory=list)
    model: str = ""
    tokens_in: int = 0
    tokens_out: int = 0


_client: httpx.AsyncClient | None = None


def client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=config.AI_TIMEOUT)
    return _client


async def _post(model: str, payload: dict) -> httpx.Response:
    return await client().post(
        f"{config.AI_BASE_URL}/chat/completions",
        headers={"Authorization": f"Bearer {config.AI_API_KEY}", "Content-Type": "application/json"},
        json={**payload, "model": model},
    )


async def chat(messages: list, *, tools: list | None = None, json_mode: bool = False,
               max_tokens: int = 1500, temperature: float = 0.3) -> Reply:
    if not config.ai_enabled():
        raise AIError("AI isn't set up yet (no AI_API_KEY)", 503)

    payload: dict = {"messages": messages, "max_tokens": max_tokens, "temperature": temperature}
    if tools:
        payload["tools"] = tools
        payload["tool_choice"] = "auto"
    if json_mode:
        payload["response_format"] = {"type": "json_object"}

    last_error = "The AI didn't answer"
    for attempt, model in enumerate([config.AI_MODEL, config.AI_FALLBACK_MODEL]):
        if attempt and model == config.AI_MODEL:
            break
        try:
            res = await _post(model, payload)
            if res.status_code == 400 and json_mode and "response_format" in payload:
                # some models refuse JSON mode; the prompt still asks for JSON
                res = await _post(model, {k: v for k, v in payload.items() if k != "response_format"})
        except httpx.HTTPError as err:
            last_error = f"Couldn't reach the AI service ({err.__class__.__name__})"
            await asyncio.sleep(0.5)
            continue
        if res.status_code == 401:
            raise AIError("The AI key was refused — check AI_API_KEY", 503)
        if res.status_code in (429, 500, 502, 503, 504):
            last_error = "The AI is busy right now. Try again in a minute." if res.status_code == 429 else "The AI service had a problem"
            await asyncio.sleep(0.5)
            continue
        if res.status_code >= 400:
            try:
                detail = res.json().get("error", {}).get("message", "")
            except ValueError:
                detail = res.text[:200]
            raise AIError(f"The AI rejected the request: {detail}"[:300], 502)

        data = res.json()
        choice = (data.get("choices") or [{}])[0].get("message") or {}
        usage = data.get("usage") or {}
        return Reply(
            content=(choice.get("content") or "").strip(),
            tool_calls=choice.get("tool_calls") or [],
            model=data.get("model") or model,
            tokens_in=int(usage.get("prompt_tokens") or 0),
            tokens_out=int(usage.get("completion_tokens") or 0),
        )
    raise AIError(last_error, 503)


def parse_json(text: str) -> dict:
    """Pull the first JSON object out of a reply (handles ```json fences and chatter)."""
    text = (text or "").strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*\})\s*```", text, re.S)
    if fenced:
        text = fenced.group(1)
    try:
        value = json.loads(text)
        if isinstance(value, dict):
            return value
    except ValueError:
        pass
    start = text.find("{")
    while start != -1:
        depth = 0
        for i in range(start, len(text)):
            if text[i] == "{":
                depth += 1
            elif text[i] == "}":
                depth -= 1
                if depth == 0:
                    try:
                        value = json.loads(text[start:i + 1])
                        if isinstance(value, dict):
                            return value
                    except ValueError:
                        break
        start = text.find("{", start + 1)
    raise AIError("The AI's answer wasn't in the expected shape. Try again.", 502)


async def ask_json(system: str, user: str, *, max_tokens: int = 1500, temperature: float = 0.2) -> tuple[dict, Reply]:
    """One question, one JSON object back."""
    messages = [
        {"role": "system", "content": system + "\n\nReply with ONE JSON object only, no other text."},
        {"role": "user", "content": user},
    ]
    reply = await chat(messages, json_mode=True, max_tokens=max_tokens, temperature=temperature)
    try:
        return parse_json(reply.content), reply
    except AIError:
        # one retry, reminding it of the format
        messages += [{"role": "assistant", "content": reply.content[:2000]},
                     {"role": "user", "content": "That wasn't valid JSON. Send only the JSON object."}]
        retry = await chat(messages, json_mode=True, max_tokens=max_tokens, temperature=0)
        retry.tokens_in += reply.tokens_in
        retry.tokens_out += reply.tokens_out
        return parse_json(retry.content), retry
