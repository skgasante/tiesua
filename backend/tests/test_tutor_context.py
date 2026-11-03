"""Instructional-awareness tests. HTTP test doubles capture the
context sent to the model and simulate replies — they prove context,
objectives and validation, not genuine Meta output quality."""
import json
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from fastapi.testclient import TestClient

from backend.app import tutor as tutor_module
from backend.app.main import app

client = TestClient(app)


class _Resp:
    def __init__(self, content): self._c = content
    def raise_for_status(self): return None
    def json(self): return {"choices": [{"message": {"content": self._c}}]}


def _setup(monkeypatch, reply="Tell me the whole equation when you have worked it out."):
    monkeypatch.setenv("MODEL_API_KEY", "test-dummy-not-a-real-key")
    captured = {}

    def _capture(url, **kwargs):
        captured["payload"] = kwargs["json"]
        return _Resp(reply)

    monkeypatch.setattr(tutor_module.httpx, "post", _capture)
    return captured


def _session(problem="(x+2)/4 = 3"):
    r = client.post("/v1/sessions", json={"problem": problem})
    assert r.status_code == 201, r.text
    return r.json()["session_id"]


def _step(sid, text):
    return client.post(f"/v1/sessions/{sid}/step", json={"input": text}).json()


def _tutor(sid, question=None):
    body = {"question": question} if question else {}
    return client.post(f"/v1/sessions/{sid}/tutor", json=body).json()


def _sent_context(captured):
    user_msg = captured["payload"]["messages"][1]["content"]
    return json.loads(user_msg.split("Verified context (JSON): ", 1)[1].rsplit(". Give the next", 1)[0])


def test_operation_proposed_context_acknowledges_choice(monkeypatch):
    captured = _setup(monkeypatch)
    sid = _session()
    _step(sid, "multiply both sides by four")
    body = _tutor(sid)
    ctx = _sent_context(captured)
    assert ctx["situation"] == "operation-proposed-not-completed"
    assert "ALREADY chosen" in ctx["instructional_objective"]
    assert ctx["pending_operation"] == "multiply both sides by 4"
    assert body["source"] == "live-meta"


def test_repeating_the_operation_question_is_rejected(monkeypatch):
    _setup(monkeypatch, reply="What operation can undo dividing by four? Tell me what you try.")
    sid = _session()
    _step(sid, "multiply both sides by four")
    body = _tutor(sid)
    assert body["source"] == "fallback-scripted"
    assert body["diagnostics"]["note"] == "model output failed validation"
    # Scripted fallback acknowledges the choice instead of re-asking.
    assert "is the operation to use" in body["text"]


def test_incorrect_result_identifies_differing_side(monkeypatch):
    captured = _setup(monkeypatch)
    sid = _session()
    _step(sid, "multiply both sides by four")
    _step(sid, "x plus two equals seven")
    _tutor(sid)
    ctx = _sent_context(captured)
    assert ctx["situation"] == "incorrect-result-after-valid-operation"
    assert ctx["established_mistake"]["differing_side"] == "the right-hand side"
    assert ctx["established_mistake"]["attempted_equation"] == "x + 2 = 7"


def test_giving_away_the_result_is_rejected(monkeypatch):
    _setup(monkeypatch, reply="Check the right side: it equals 12. Say the equation again.")
    sid = _session()
    _step(sid, "multiply both sides by four")
    _step(sid, "x plus two equals seven")
    body = _tutor(sid)
    assert body["source"] == "fallback-scripted"
    assert "right-hand side" in body["text"]


def test_stock_praise_opener_is_rejected(monkeypatch):
    _setup(monkeypatch, reply="Good work! Now tell me the equation you get.")
    sid = _session()
    _step(sid, "multiply both sides by four")
    body = _tutor(sid)
    assert body["source"] == "fallback-scripted"


def test_second_problem_context_generalises(monkeypatch):
    captured = _setup(monkeypatch)
    sid = _session("(x-3)/2 = 5")
    _step(sid, "multiply both sides by two")
    _step(sid, "x minus three equals seven")
    _tutor(sid)
    ctx = _sent_context(captured)
    assert ctx["situation"] == "incorrect-result-after-valid-operation"
    assert ctx["established_mistake"]["differing_side"] == "the right-hand side"
    assert ctx["problem"] == "(x - 3)/2 = 5"


def test_conceptual_and_hint_situations(monkeypatch):
    _setup(monkeypatch)
    sid = _session()
    body_q = _tutor(sid, question="Why do we do the same thing to both sides?")
    assert body_q["diagnostics"]["situation"] == "conceptual-question"
    body_h = _tutor(sid, question="Give me a hint")
    assert body_h["diagnostics"]["situation"] == "hint-request"


def test_correct_intermediate_situation(monkeypatch):
    captured = _setup(monkeypatch)
    sid = _session()
    _step(sid, "x+2=12")
    _tutor(sid)
    ctx = _sent_context(captured)
    assert ctx["situation"] == "correct-intermediate-equation"
