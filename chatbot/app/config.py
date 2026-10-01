"""Settings, read once from the environment (and chatbot/.env when present)."""
import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parent.parent / ".env")


def _clean(url: str) -> str:
    return url.strip().rstrip("/")


AI_API_KEY = os.getenv("AI_API_KEY", "").strip()
AI_BASE_URL = _clean(os.getenv("AI_BASE_URL") or "https://api.groq.com/openai/v1")
AI_MODEL = os.getenv("AI_MODEL") or "openai/gpt-oss-120b"
AI_FALLBACK_MODEL = os.getenv("AI_FALLBACK_MODEL") or "llama-3.3-70b-versatile"
BACKEND_URL = _clean(os.getenv("BACKEND_URL") or "http://localhost:5000")
FRONTEND_URLS = [_clean(u) for u in (os.getenv("FRONTEND_URL") or "http://localhost:5174").split(",") if u.strip()]
PORT = int(os.getenv("PORT") or 8000)

# How long to wait for the model / the backend (seconds)
AI_TIMEOUT = float(os.getenv("AI_TIMEOUT") or 60)
BACKEND_TIMEOUT = float(os.getenv("BACKEND_TIMEOUT") or 20)

# The landing-page chatbot needs no login, so it gets a small per-visitor allowance
PUBLIC_CHAT_PER_HOUR = int(os.getenv("PUBLIC_CHAT_PER_HOUR") or 20)


def ai_enabled() -> bool:
    return bool(AI_API_KEY)
