"""Reading and writing Taskflow data — always through the Taskflow backend,
signed in as the person who is asking. The AI can never see more than they can.
"""
from dataclasses import dataclass

import httpx
from fastapi import HTTPException, Request

from . import config


class BackendError(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status
        self.message = message


_client: httpx.AsyncClient | None = None


def client() -> httpx.AsyncClient:
    global _client
    if _client is None:
        _client = httpx.AsyncClient(timeout=config.BACKEND_TIMEOUT)
    return _client


@dataclass
class Backend:
    token: str
    company_id: str | None = None

    def _headers(self, company: str | None = None) -> dict:
        h = {"Authorization": f"Bearer {self.token}"}
        cid = self.company_id if company is None else company
        if cid:
            h["X-Company-Id"] = cid
        return h

    async def request(self, method: str, path: str, *, params: dict | None = None, json: dict | None = None,
                      company: str | None = None):
        try:
            res = await client().request(method, f"{config.BACKEND_URL}{path}", params=params, json=json,
                                         headers=self._headers(company))
        except httpx.HTTPError as err:
            raise BackendError(503, f"Couldn't reach the Taskflow backend ({err.__class__.__name__})") from err
        try:
            data = res.json()
        except ValueError:
            data = None
        if res.status_code >= 400:
            message = (data or {}).get("error") if isinstance(data, dict) else None
            raise BackendError(res.status_code, message or f"Backend said {res.status_code}")
        return data

    async def get(self, path: str, **params):
        return await self.request("GET", path, params={k: v for k, v in params.items() if v not in (None, "")})

    async def post(self, path: str, body: dict | None = None):
        return await self.request("POST", path, json=body or {})


@dataclass
class Ctx:
    """Everything a feature needs: who's asking, where, and a backend signed in as them."""
    backend: Backend
    user: dict
    company: dict | None
    remaining: int

    @property
    def company_id(self) -> str | None:
        return self.company["id"] if self.company else None

    async def record(self, feature: str, reply) -> None:
        """Count one AI call against the person's / company's daily allowance."""
        try:
            await self.backend.post("/ai/usage", {
                "feature": feature, "model": getattr(reply, "model", ""),
                "tokens_in": getattr(reply, "tokens_in", 0), "tokens_out": getattr(reply, "tokens_out", 0),
            })
        except BackendError:
            pass  # usage logging must never break an answer


def token_from(request: Request) -> str | None:
    auth = request.headers.get("authorization") or ""
    return auth[7:].strip() if auth.lower().startswith("bearer ") else None


async def signed_in(request: Request) -> Ctx:
    """FastAPI dependency: checks the login and today's AI allowance with the backend."""
    token = token_from(request)
    if not token:
        raise HTTPException(401, "Please log in")
    company_id = request.headers.get("x-company-id") or None
    backend = Backend(token, company_id)
    try:
        quota = await backend.get("/ai/quota")
    except BackendError as err:
        if err.status in (401, 403):
            raise HTTPException(err.status, err.message) from err
        raise HTTPException(503, err.message) from err
    if not quota.get("allowed"):
        raise HTTPException(429, "You've used today's AI allowance. It resets at midnight (UTC).")
    return Ctx(backend=backend, user=quota["user"], company=quota.get("company"), remaining=quota.get("remaining", 0))
