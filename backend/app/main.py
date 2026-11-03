"""TieSua verification + tutoring API.

Run:  .venv\\Scripts\\python -m uvicorn backend.app.main:app --port 8000
Docs: http://127.0.0.1:8000/docs

The verifier never evaluates learner text as code. Meta Model API
credentials are read from the server environment only
(MODEL_API_KEY or META_API_KEY; META_MODEL optional) and are never
returned by any endpoint.
"""
from __future__ import annotations

import os
import time
from collections import defaultdict, deque

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

from . import shared_store
from .session_storage import transaction, SessionConflict
from fastapi.responses import JSONResponse

from .mathparse import MathParseError
from .tutor import BUDGET, DIAGNOSTICS, lesson_guidance, tutor_guidance
from .interpret import interpret_request
from .orchestrator import orchestrate_request
from .verifier import create_session, get_session, state_payload, submit_step, undo_last_step

app = FastAPI(title="TieSua Verification API", version="0.2.0")

from .public_requests import protect
app.middleware("http")(protect)

# CORS is not authentication or abuse prevention — it only controls
# which web origins browsers may call from. Production must set
# ALLOWED_ORIGINS to the exact demo origin(s).
_origins = os.environ.get("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in _origins.split(",") if o.strip()],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)


@app.middleware("http")
async def limit_body_size(request: Request, call_next):
    from fastapi.responses import JSONResponse
    length = request.headers.get("content-length")
    if length is not None and (not length.isdigit() or int(length) > 16384):
        return JSONResponse(status_code=413, content={"detail": "Request too large."})
    return await call_next(request)


class CreateSessionRequest(BaseModel):
    problem: str = Field(min_length=1, max_length=200, examples=["(x+2)/4 = 3"])


class StepRequest(BaseModel):
    input: str = Field(min_length=0, max_length=500)


class TutorRequest(BaseModel):
    question: str | None = Field(default=None, max_length=500)


class InterpretRequest(BaseModel):
    text: str = Field(min_length=1, max_length=300)
    context: dict = Field(default_factory=dict)


class LessonTutorRequest(BaseModel):
    lesson_title: str = Field(min_length=1, max_length=120)
    example: str = Field(default="", max_length=120)
    explanation: str = Field(min_length=1, max_length=1500)
    question: str = Field(min_length=1, max_length=300)


def _session_or_404(session_id: str):
    session = get_session(session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found. Start a new problem.")
    return session


@app.get("/health")
def health() -> dict:
    return {"status": "ok", "service": "tiesua-verifier"}


@app.post("/v1/sessions", status_code=201)
def create(req: CreateSessionRequest) -> dict:
    try:
        sid, session = create_session(req.problem)
    except MathParseError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    return {"session_id": sid, "state": state_payload(session)}


@app.get("/v1/sessions/{session_id}")
def read_session(session_id: str) -> dict:
    return {"session_id": session_id, "state": state_payload(_session_or_404(session_id))}


@app.post("/v1/sessions/{session_id}/step")
def step(session_id: str, req: StepRequest) -> dict:
    with transaction(session_id) as session:
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found. Start a new problem.")
        result = submit_step(session, req.input)
    return {"session_id": session_id, **result}


# Cost guard: tutoring is the only endpoint that can spend Meta API
# budget, so it is rate-limited per client (default 30/minute,
# TIESUA_TUTOR_RATE_PER_MIN). Verification itself stays unmetered
# locally but is cheap exact computation.
_TUTOR_HITS: dict[str, deque] = defaultdict(deque)


def _check_tutor_rate(request: Request) -> None:
    limit = int(os.environ.get("TIESUA_TUTOR_RATE_PER_MIN", "30"))
    if shared_store.enabled():
        import hashlib
        identity = request.headers.get("x-forwarded-for", request.client.host if request.client else "unknown").split(",")[0].strip()
        identity = hashlib.sha256(identity.encode()).hexdigest()
        global_limit = int(os.getenv("TIESUA_TUTOR_GLOBAL_RATE_PER_MIN", "120"))
        if not shared_store.rate_allowed(identity, limit) or not shared_store.rate_allowed("all-clients", global_limit):
            raise HTTPException(status_code=429, detail="Please wait a moment before trying again. Your place is kept.")
        return
    window = 60.0
    now = time.monotonic()
    hits = _TUTOR_HITS[request.client.host if request.client else "unknown"]
    while hits and now - hits[0] > window:
        hits.popleft()
    if len(hits) >= limit:
        raise HTTPException(status_code=429, detail="Tutoring is being used very quickly. Wait a few seconds and try again — your verified work is safe.")
    hits.append(now)


@app.post("/v1/sessions/{session_id}/undo")
def undo(session_id: str) -> dict:
    with transaction(session_id) as session:
        if session is None:
            raise HTTPException(status_code=404, detail="Session not found. Start a new problem.")
        result = undo_last_step(session)
    return {"session_id": session_id, **result}


@app.post("/v1/interpret")
def interpret(req: InterpretRequest, request: Request) -> dict:
    """Meta-powered interpretation of unfamiliar learner language.
    Returns validated registry proposals only — execution happens
    client-side after a second validation. Rate-limited like the
    tutor because it spends the same budget."""
    _check_tutor_rate(request)
    return interpret_request(req.text, req.context)


@app.post("/v1/sessions/{session_id}/tutor")
def tutor(session_id: str, req: TutorRequest, request: Request) -> dict:
    _check_tutor_rate(request)
    session = _session_or_404(session_id)
    return {"session_id": session_id, **tutor_guidance(session, req.question)}


@app.post("/v1/orchestrate")
def orchestrate(req: InterpretRequest, request: Request) -> dict:
    """Central AI orchestrator: one validated plan per meaningful
    turn (registry actions + a teaching move + a short reply).
    Execution happens client-side after a second validation, and
    teaching moves are gated by lesson-engine preconditions.
    Rate-limited like all paid endpoints; spends the same budget."""
    _check_tutor_rate(request)
    return orchestrate_request(req.text, req.context)


@app.post("/v1/tutor/lesson")
def tutor_lesson(req: LessonTutorRequest, request: Request) -> dict:
    """Grounded conceptual questions for lessons without an equation
    session (e.g. fractions). Rate-limited like all paid tutoring."""
    _check_tutor_rate(request)
    return lesson_guidance(req.lesson_title, req.example, req.explanation, req.question)


@app.get("/v1/diagnostics")
def diagnostics(request: Request) -> dict:
    """Public callers get counts only. Detailed entries (source,
    model, latency, verdict — never credentials or learner text)
    require TIESUA_DIAGNOSTICS_DETAIL=1 locally, or the
    X-Diagnostics-Token header matching TIESUA_DIAGNOSTICS_TOKEN."""
    summary = {
        "total_tutor_responses": len(DIAGNOSTICS),
        "live_meta": sum(1 for d in DIAGNOSTICS if d.get("source") == "live-meta"),
        "fallback_scripted": sum(1 for d in DIAGNOSTICS if d.get("source") == "fallback-scripted"),
        "budget": BUDGET.status(),
    }
    token = os.environ.get("TIESUA_DIAGNOSTICS_TOKEN")
    detail_ok = (not os.environ.get("VERCEL") and os.environ.get("TIESUA_DIAGNOSTICS_DETAIL") == "1") or (
        bool(token) and request.headers.get("x-diagnostics-token") == token)
    if detail_ok:
        from .usage import status
        usage = status() if shared_store.enabled() else None
        return {**summary, "usage": usage, "entries": DIAGNOSTICS[-50:]}
    return summary


@app.exception_handler(shared_store.StoreUnavailable)
async def storage_unavailable(request: Request, exc: Exception):
    return JSONResponse(status_code=503, content={"detail": "I cannot reach your saved work just now. Please try again in a moment."}, headers={"Retry-After": "5"})


@app.exception_handler(SessionConflict)
async def session_conflict(request: Request, exc: Exception):
    return JSONResponse(status_code=409, content={"detail": "Your previous step is still being checked. Please try again."}, headers={"Retry-After": "2"})


@app.get("/ready")
def ready():
    if shared_store.enabled():
        shared_store.command("PING")
    model = os.getenv("META_MODEL") or os.getenv("MODEL_NAME") or "muse-spark-1.3-contributor"
    if os.getenv("VERCEL") and model != "muse-spark-1.3-contributor":
        raise HTTPException(status_code=503, detail="The teaching model is not configured correctly.")
    return {"status": "ready", "storage": "shared" if shared_store.enabled() else "local",
            "model": model, "live_ai_configured": bool(os.getenv("MODEL_API_KEY") or os.getenv("META_API_KEY"))}
