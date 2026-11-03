"""Tutor safeguard tests. These use test doubles for the HTTP layer —
they prove validation, timeout and error handling. They are NOT
evidence of a genuine Meta API call; that requires a real key and is
reported separately."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import httpx
from fastapi.testclient import TestClient

from backend.app import tutor as tutor_module
from backend.app.main import app

client = TestClient(app)


class _FakeResponse:
    def __init__(self, content):
        self._content = content

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict:
        return {"choices": [{"message": {"content": self._content}}]}


def _session_with_invalid_step() -> str:
    r = client.post("/v1/sessions", json={"problem": "(x+2)/4 = 3"})
    sid = r.json()["session_id"]
    client.post(f"/v1/sessions/{sid}/step", json={"input": "x plus two equals seven"})
    return sid


def _tutor(sid: str) -> dict:
    return client.post(f"/v1/sessions/{sid}/tutor", json={}).json()


def test_contradictory_model_output_is_rejected(monkeypatch):
    monkeypatch.setenv("MODEL_API_KEY", "test-dummy-not-a-real-key")
    monkeypatch.setattr(tutor_module.httpx, "post", lambda *a, **k: _FakeResponse("That's correct! Well done, you got it right."))
    body = _tutor(_session_with_invalid_step())
    assert body["source"] == "fallback-scripted"
    assert body["diagnostics"]["note"] == "model output failed validation"


def test_model_claiming_solved_early_is_rejected(monkeypatch):
    monkeypatch.setenv("MODEL_API_KEY", "test-dummy-not-a-real-key")
    monkeypatch.setattr(tutor_module.httpx, "post", lambda *a, **k: _FakeResponse("You have solved it! The answer is x = 10."))
    body = _tutor(_session_with_invalid_step())
    assert body["source"] == "fallback-scripted"


def test_timeout_falls_back_with_diagnostic(monkeypatch):
    monkeypatch.setenv("MODEL_API_KEY", "test-dummy-not-a-real-key")

    def _timeout(*a, **k):
        raise httpx.ConnectTimeout("timed out")

    monkeypatch.setattr(tutor_module.httpx, "post", _timeout)
    body = _tutor(_session_with_invalid_step())
    assert body["source"] == "fallback-scripted"
    assert body["diagnostics"]["note"] == "ConnectTimeout"
    assert "not live AI" in body["text"]


def test_connection_error_falls_back_with_diagnostic(monkeypatch):
    monkeypatch.setenv("MODEL_API_KEY", "test-dummy-not-a-real-key")

    def _fail(*a, **k):
        raise httpx.ConnectError("refused")

    monkeypatch.setattr(tutor_module.httpx, "post", _fail)
    body = _tutor(_session_with_invalid_step())
    assert body["source"] == "fallback-scripted"
    assert body["diagnostics"]["note"] == "ConnectError"


def test_well_formed_model_output_is_used_and_labelled(monkeypatch):
    monkeypatch.setenv("MODEL_API_KEY", "test-dummy-not-a-real-key")
    monkeypatch.setattr(tutor_module.httpx, "post",
                        lambda *a, **k: _FakeResponse("Good effort. Check what multiplying by four does to the three on the right side. What do you get?"))
    body = _tutor(_session_with_invalid_step())
    assert body["source"] == "live-meta"
    assert body["model"] == "muse-spark-1.3-contributor"  # current default, env-configurable


def test_empty_model_content_falls_back_never_says_none(monkeypatch):
    # Regression: a reasoning model that returns content=None must
    # produce labelled scripted guidance, never the literal text None.
    monkeypatch.setenv("MODEL_API_KEY", "test-dummy-not-a-real-key")
    monkeypatch.setattr(tutor_module.httpx, "post", lambda *a, **k: _FakeResponse(None))
    body = _tutor(_session_with_invalid_step())
    assert body["source"] == "fallback-scripted"
    assert body["diagnostics"]["note"] == "empty model content"
    assert body["text"] != "None"
    assert "not live AI" in body["text"]


def test_content_parts_list_is_joined(monkeypatch):
    monkeypatch.setenv("MODEL_API_KEY", "test-dummy-not-a-real-key")
    parts = [{"type": "text", "text": "Good effort. "}, {"type": "text", "text": "What does four times three give you?"}]
    monkeypatch.setattr(tutor_module.httpx, "post", lambda *a, **k: _FakeResponse(parts))
    body = _tutor(_session_with_invalid_step())
    assert body["source"] == "live-meta"
    assert "four times three" in body["text"]


def test_request_uses_minimal_reasoning_and_realistic_cap(monkeypatch):
    monkeypatch.setenv("MODEL_API_KEY", "test-dummy-not-a-real-key")
    monkeypatch.delenv("META_MAX_TOKENS", raising=False)
    monkeypatch.delenv("META_REASONING_EFFORT", raising=False)
    seen = {}

    def _capture(url, **kwargs):
        seen.update(kwargs["json"])
        return _FakeResponse("Keep going. What is the next small step?")

    monkeypatch.setattr(tutor_module.httpx, "post", _capture)
    _tutor(_session_with_invalid_step())
    assert seen["reasoning_effort"] == "minimal"
    assert seen["max_tokens"] >= 800


def test_default_model_is_spark_1_3_contributor(monkeypatch):
    monkeypatch.delenv("META_MODEL", raising=False)
    monkeypatch.delenv("MODEL_NAME", raising=False)
    monkeypatch.setenv("MODEL_API_KEY", "test-dummy-not-a-real-key")
    seen = {}

    def _capture(url, **kwargs):
        seen["model"] = kwargs["json"]["model"]
        return _FakeResponse("Keep going. What is the next small step?")

    monkeypatch.setattr(tutor_module.httpx, "post", _capture)
    _tutor(_session_with_invalid_step())
    assert seen["model"] == "muse-spark-1.3-contributor"
