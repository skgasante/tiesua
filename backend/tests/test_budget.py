"""Server-wide Meta budget tests. All model responses are test
doubles — no genuine API credits are used for security testing."""
import os
import sys
import threading

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import pytest
from fastapi.testclient import TestClient

from backend.app import tutor as tutor_module
from backend.app.main import app
from backend.app.verifier import create_session

client = TestClient(app)


class _Resp:
    def __init__(self, content="Keep going. What is the next small step?"):
        self._c = content

    def raise_for_status(self):
        return None

    def json(self):
        return {"choices": [{"message": {"content": self._c}}]}


@pytest.fixture(autouse=True)
def _reset_budget(monkeypatch):
    tutor_module.BUDGET._calls.clear()
    tutor_module.BUDGET._tokens.clear()
    monkeypatch.setenv("MODEL_API_KEY", "test-dummy-not-a-real-key")
    monkeypatch.setattr(tutor_module.httpx, "post", lambda *a, **k: _Resp())
    yield
    tutor_module.BUDGET._calls.clear()
    tutor_module.BUDGET._tokens.clear()


def _tutor(sid: str) -> dict:
    return client.post(f"/v1/sessions/{sid}/tutor", json={}).json()


def _session() -> str:
    return client.post("/v1/sessions", json={"problem": "(x+2)/4 = 3"}).json()["session_id"]


def test_call_budget_exhaustion_returns_labelled_fallback(monkeypatch):
    monkeypatch.setenv("TIESUA_BUDGET_MAX_CALLS", "2")
    monkeypatch.setenv("TIESUA_BUDGET_MAX_TOKENS", "100000")
    sid = _session()
    assert _tutor(sid)["source"] == "live-meta"
    assert _tutor(sid)["source"] == "live-meta"
    # A different session/client cannot bypass the server-wide cap.
    other = _session()
    body = _tutor(other)
    assert body["source"] == "fallback-scripted"
    assert body["diagnostics"]["note"] == "meta budget exhausted"
    assert "budget" in body["text"].lower()
    assert "not live AI" in body["text"]


def test_token_budget_exhaustion(monkeypatch):
    monkeypatch.setenv("TIESUA_BUDGET_MAX_CALLS", "100")
    monkeypatch.setenv("TIESUA_BUDGET_MAX_TOKENS", "1000")
    monkeypatch.setenv("META_MAX_TOKENS", "800")
    sid = _session()
    assert _tutor(sid)["source"] == "live-meta"
    assert _tutor(sid)["source"] == "fallback-scripted"


def test_concurrent_requests_cannot_race_past_the_cap(monkeypatch):
    monkeypatch.setenv("TIESUA_BUDGET_MAX_CALLS", "3")
    monkeypatch.setenv("TIESUA_BUDGET_MAX_TOKENS", "1000000")

    def _slow(*a, **k):
        import time as t
        t.sleep(0.05)
        return _Resp()

    monkeypatch.setattr(tutor_module.httpx, "post", _slow)
    _, session = create_session("(x+2)/4 = 3")
    results: list[str] = []

    def _call():
        results.append(tutor_module.tutor_guidance(session)["source"])

    threads = [threading.Thread(target=_call) for _ in range(10)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert results.count("live-meta") == 3
    assert results.count("fallback-scripted") == 7


def test_diagnostics_public_summary_hides_entries(monkeypatch):
    monkeypatch.delenv("TIESUA_DIAGNOSTICS_DETAIL", raising=False)
    monkeypatch.delenv("TIESUA_DIAGNOSTICS_TOKEN", raising=False)
    body = client.get("/v1/diagnostics").json()
    assert "entries" not in body
    assert "budget" in body
    assert "live_meta" in body


def test_diagnostics_detail_requires_token(monkeypatch):
    monkeypatch.delenv("TIESUA_DIAGNOSTICS_DETAIL", raising=False)
    monkeypatch.setenv("TIESUA_DIAGNOSTICS_TOKEN", "test-token")
    assert "entries" not in client.get("/v1/diagnostics").json()
    with_token = client.get("/v1/diagnostics", headers={"x-diagnostics-token": "test-token"}).json()
    assert "entries" in with_token
