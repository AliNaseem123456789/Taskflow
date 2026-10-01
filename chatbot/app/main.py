"""Taskflow AI service.

Run:  uvicorn app.main:app --port 8000      (from the chatbot folder)

Every signed-in endpoint takes the person's Taskflow access token
(Authorization: Bearer …) and the chosen company (X-Company-Id), checks today's
allowance with the backend, and reads data through the backend as that person.
"""
from fastapi import Depends, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from . import config
from .backend import BackendError, Ctx, signed_in, token_from
from .features import assistant
from .llm import AIError

app = FastAPI(title="Taskflow AI", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=config.FRONTEND_URLS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Company-Id"],
)


@app.exception_handler(HTTPException)
async def _http_error(_req: Request, err: HTTPException):
    # same shape as the Taskflow backend: { "error": "..." }
    return JSONResponse({"error": err.detail}, status_code=err.status_code)


@app.exception_handler(AIError)
async def _ai_error(_req: Request, err: AIError):
    return JSONResponse({"error": str(err)}, status_code=err.status)


@app.exception_handler(BackendError)
async def _backend_error(_req: Request, err: BackendError):
    status = err.status if err.status in (400, 401, 403, 404, 409, 429) else 502
    return JSONResponse({"error": err.message}, status_code=status)


@app.get("/api/health")
async def health():
    """The frontend asks this to decide whether to show AI buttons."""
    return {"ok": True, "ai": config.ai_enabled(), "model": config.AI_MODEL if config.ai_enabled() else None}


# ── Assistant chat ───────────────────────────────────────────────────────────
class ChatIn(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    history: list[dict] = Field(default_factory=list)


@app.post("/api/chat")
async def chat_endpoint(body: ChatIn, request: Request):
    """Same address as the old chatbot. Signed in → work assistant; not signed in → product questions."""
    if not token_from(request):
        ip = request.client.host if request.client else "unknown"
        if not assistant.public_allowed(ip):
            return JSONResponse({"response": "That's a lot of questions! Please try again in a little while."}, status_code=429)
        if not config.ai_enabled():
            return {"response": "The assistant isn't switched on yet."}
        return {"response": await assistant.answer_public(body.message, body.history)}
    ctx = await signed_in(request)
    return await assistant.answer(ctx, body.message, body.history)


def register(router_module) -> None:
    """Each feature module adds its own routes."""
    router_module.add_routes(app, signed_in)


# Features added in later steps register here
from .features import task_helpers, team_helpers, problem_solver  # noqa: E402

for _module in (task_helpers, team_helpers, problem_solver):
    register(_module)


__all__ = ["app", "Ctx", "Depends"]
