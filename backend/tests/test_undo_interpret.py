import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

import pytest
from fastapi.testclient import TestClient

from backend.app import interpret as interpret_module
from backend.app import tutor as tutor_module
from backend.app.main import app

client = TestClient(app)


def _session(problem="(x+2)/4 = 3") -> str:
    return client.post("/v1/sessions", json={"problem": problem}).json()["session_id"]


def _step(sid, text):
    return client.post(f"/v1/sessions/{sid}/step", json={"input": text}).json()


# ------------------------------------------------------------------ undo
def test_undo_restores_previous_verified_state():
    sid = _session()
    _step(sid, "x+2=12")
    body = client.post(f"/v1/sessions/{sid}/undo").json()
    assert body["verdict"] == "valid"
    assert body["state"]["equation_text"] == "(x + 2)/4 = 3"
    # And the lesson can proceed again from the restored state.
    assert _step(sid, "x+2=12")["state"]["equation_text"] == "x + 2 = 12"


def test_undo_with_no_history_is_unsupported_not_invented():
    body = client.post(f"/v1/sessions/{_session()}/undo").json()
    assert body["verdict"] == "unsupported"
    assert body["state"]["equation_text"] == "(x + 2)/4 = 3"


def test_undo_unsolves_a_completed_problem():
    sid = _session("x+5 = 12")
    assert _step(sid, "x=7")["state"]["solved"] is True
    body = client.post(f"/v1/sessions/{sid}/undo").json()
    assert body["state"]["solved"] is False


# -------------------------------------------------------------- interpret
class _Resp:
    def __init__(self, payload): self._p = payload
    def raise_for_status(self): return None
    def json(self): return {"choices": [{"message": {"content": json.dumps(self._p)}}]}


@pytest.fixture(autouse=True)
def _reset():
    tutor_module.BUDGET._calls.clear()
    tutor_module.BUDGET._tokens.clear()
    yield
    tutor_module.BUDGET._calls.clear()
    tutor_module.BUDGET._tokens.clear()


def test_interpret_returns_validated_actions(monkeypatch):
    monkeypatch.setenv("MODEL_API_KEY", "test-dummy-not-a-real-key")
    monkeypatch.setattr(interpret_module.httpx, "post", lambda *a, **k: _Resp(
        {"actions": [{"name": "speech.setRate", "args": {"delta": -0.2}, "scope": "temporary"}], "confidence": 0.9, "clarification": None}))
    body = client.post("/v1/interpret", json={"text": "slow down for this one", "context": {}}).json()
    assert body["source"] == "live-meta"
    assert body["actions"][0]["name"] == "speech.setRate"


def test_interpret_tolerates_prose_around_json(monkeypatch):
    monkeypatch.setenv("MODEL_API_KEY", "test-dummy-not-a-real-key")

    class _ProseResp:
        def raise_for_status(self): return None
        def json(self):
            return {"choices": [{"message": {"content": 'Here is my reading: {"actions": [{"name": "speech.setPauses", "args": {"delta": -0.5}}], "confidence": 0.9, "clarification": null}'}}]}

    monkeypatch.setattr(interpret_module.httpx, "post", lambda *a, **k: _ProseResp())
    body = client.post("/v1/interpret", json={"text": "less pausing please", "context": {}}).json()
    assert body["source"] == "live-meta"
    assert body["actions"][0]["name"] == "speech.setPauses"


def test_interpret_hallucinated_action_becomes_clarification(monkeypatch):
    monkeypatch.setenv("MODEL_API_KEY", "test-dummy-not-a-real-key")
    monkeypatch.setattr(interpret_module.httpx, "post", lambda *a, **k: _Resp(
        {"actions": [{"name": "system.deleteEverything", "args": {}}], "confidence": 0.99, "clarification": None}))
    body = client.post("/v1/interpret", json={"text": "do the thing", "context": {}}).json()
    assert body["source"] == "clarification"
    assert body["actions"] == []


def test_interpret_without_key_is_unavailable_not_faked(monkeypatch):
    monkeypatch.delenv("MODEL_API_KEY", raising=False)
    monkeypatch.delenv("META_API_KEY", raising=False)
    monkeypatch.delenv("TIESUA_TUTOR_MOCK", raising=False)
    body = client.post("/v1/interpret", json={"text": "something vague", "context": {}}).json()
    assert body["source"] == "unavailable"
    assert body["actions"] == []
