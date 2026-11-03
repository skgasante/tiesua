"""Adaptive-tutor acceptance matrix (mocked Meta, controlled state).

Each case verifies the spoken-facing result AND whether lesson
progression was permitted. No genuine Meta calls: TIESUA_TUTOR_MOCK.
The lesson under test is the guided demonstration (x+2)/4 = 3.
"""
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.orchestrator import _validate_plan


@pytest.fixture(autouse=True)
def mock_mode(monkeypatch):
    monkeypatch.setenv("TIESUA_TUTOR_MOCK", "1")


@pytest.fixture()
def client():
    return TestClient(app)


def _session(client) -> str:
    r = client.post("/v1/sessions", json={"problem": "(x+2)/4 = 3"})
    assert r.status_code in (200, 201)
    return r.json()["session_id"]


def _step(client, sid, text):
    r = client.post(f"/v1/sessions/{sid}/step", json={"input": text})
    assert r.status_code == 200
    return r.json()


def _orchestrate(client, text, **ctx):
    r = client.post("/v1/orchestrate", json={"text": text, "context": {"screen": "lesson", "stage": "guided", **ctx}})
    assert r.status_code == 200
    return r.json()


def test_case1_correct_step_progresses(client):
    sid = _session(client)
    r = _step(client, sid, "multiply both sides by four")
    assert r["verdict"] == "valid" and r["action_type"] == "operation"
    assert r["state"]["pending_operation"] is not None  # progression permitted by verification


def test_case2_incorrect_step_blocked_state_kept(client):
    sid = _session(client)
    _step(client, sid, "multiply both sides by four")
    r = _step(client, sid, "x plus two equals seven")
    assert r["verdict"] == "invalid"
    assert r["state"]["equation_text"] == "(x + 2)/4 = 3"  # no progression, state exact


def test_case3_correct_partial_step_acknowledged_not_complete(client):
    sid = _session(client)
    _step(client, sid, "multiply both sides by four")
    r = _step(client, sid, "x plus two equals twelve")
    assert r["verdict"] == "valid"           # correct partial step recognised
    assert r["state"]["solved"] is False     # ...but the lesson is NOT complete
    assert r["state"]["equation_text"] == "x + 2 = 12"


def test_case4_help_question_keeps_problem_and_resumes_exactly(client):
    sid = _session(client)
    _step(client, sid, "multiply both sides by four")
    _step(client, sid, "x plus two equals twelve")
    r = _step(client, sid, "What do you expect me to do actually?")
    assert r["action_type"] == "question"                    # purpose understood as help
    assert r["state"]["equation_text"] == "x + 2 = 12"       # nothing moved
    plan = _orchestrate(client, "What do you expect me to do actually?", equation="x + 2 = 12")
    assert plan["source"] == "mock"
    # Resume exactly where left off, on the same verified state:
    r = _step(client, sid, "subtract two from both sides")
    assert r["verdict"] == "valid"
    r = _step(client, sid, "x equals ten")
    assert r["verdict"] == "valid" and r["state"]["solved"] is True


def test_case5_confusion_chooses_explain_differently(client):
    plan = _orchestrate(client, "I don't understand")
    assert plan["teachingMove"] == "explain-differently"  # support, not progression


def test_case6_explain_again_is_a_teaching_continuation(client):
    plan = _validate_plan({"actions": [], "teachingMove": "none", "confidence": 0.9,
                           "reply": "The four divides the whole of x plus two, so we undo it on both sides."})
    assert plan is not None and plan["continuation"] == "teach-next"  # never a dead end


def test_case7_hint_request_is_not_a_solution(client):
    sid = _session(client)
    r = _step(client, sid, "Give me a hint")
    # The verifier must not accept a help request as mathematics:
    assert r["verdict"] != "valid" or r["action_type"] in ("question", "incomplete_input", "operation")
    assert r["state"]["solved"] is False


def test_case8_another_example_request(client):
    plan = _orchestrate(client, "Can we do another example?")
    assert plan["teachingMove"] == "guided-example"


def test_case10_question_mid_solving_changes_nothing(client):
    sid = _session(client)
    _step(client, sid, "multiply both sides by four")
    r = _step(client, sid, "Why must both sides stay equal?")
    assert r["action_type"] == "question"
    assert r["state"]["equation_text"] == "(x + 2)/4 = 3"
    # And the pending verified work still completes afterwards:
    r = _step(client, sid, "x plus two equals twelve")
    assert r["verdict"] == "valid"
