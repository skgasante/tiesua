"""Multi-solution final answers: a valid individual solution is not
automatically a complete solution. Test-only audit case (x*x = 3x);
the learner curriculum stays Junior High linear scope."""
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)


def new_session(problem: str = "x*x = 3x") -> str:
    r = client.post("/v1/sessions", json={"problem": problem})
    assert r.status_code == 201, r.text
    return r.json()["session_id"]


def step(sid: str, text: str) -> dict:
    r = client.post(f"/v1/sessions/{sid}/step", json={"input": text})
    assert r.status_code == 200, r.text
    return r.json()


def test_one_valid_solution_is_partial_not_solved():
    body = step(new_session(), "x = 0")
    assert body["action_type"] == "final_answer"
    assert body["verdict"] == "valid"
    assert body["verified_facts"]["solution_status"] == "partial"
    assert body["verified_facts"]["solutions_found"] == ["0"]
    assert body["verified_facts"]["solutions_remaining"] == 1
    assert body["state"]["solved"] is False


def test_completing_the_set_solves():
    sid = new_session()
    step(sid, "x = 0")
    body = step(sid, "x = 3")
    assert body["verdict"] == "valid"
    assert body["verified_facts"]["solution_status"] == "complete"
    assert sorted(body["verified_facts"]["solutions_found"]) == ["0", "3"]
    assert body["state"]["solved"] is True


def test_order_does_not_matter():
    sid = new_session()
    assert step(sid, "x = 3")["verified_facts"]["solution_status"] == "partial"
    body = step(sid, "x = 0")
    assert body["verified_facts"]["solution_status"] == "complete"
    assert body["state"]["solved"] is True


def test_repeating_a_found_solution_stays_partial():
    sid = new_session()
    step(sid, "x = 0")
    body = step(sid, "x = 0")
    assert body["verdict"] == "valid"
    assert body["verified_facts"]["solution_status"] == "partial"
    assert body["verified_facts"]["solutions_found"] == ["0"]
    assert body["state"]["solved"] is False


def test_partial_answer_does_not_replace_the_equation():
    sid = new_session()
    before = client.get(f"/v1/sessions/{sid}").json()["state"]["equation_text"]
    step(sid, "x = 0")
    after = client.get(f"/v1/sessions/{sid}").json()["state"]["equation_text"]
    assert after == before


def test_wrong_value_is_not_a_partial_solution():
    body = step(new_session(), "x = 5")
    assert body["verdict"] == "invalid"
    assert body["error_category"] == "final-answer-incorrect"
    assert body["state"]["solved"] is False


def test_divide_by_x_then_both_solutions_complete_the_set():
    sid = new_session()
    step(sid, "divide both sides by x")
    first = step(sid, "x = 3")
    assert first["verdict"] == "valid"
    assert first["verified_facts"]["solution_status"] == "partial"
    assert first["state"]["solved"] is False
    assert first["state"]["restrictions"] == ["x != 0"]
    second = step(sid, "x = 0")
    assert second["verified_facts"]["solution_status"] == "complete"
    assert second["state"]["solved"] is True


def test_extraneous_value_is_distinguished_from_partial():
    sid = new_session("x+2 = 12")
    step(sid, "multiply both sides by x")
    step(sid, "x(x+2) = 12x")
    body = step(sid, "x = 0")
    assert body["verdict"] == "invalid"
    assert body["error_category"] == "extraneous-solution"
    assert body["state"]["solved"] is False
    assert body["state"].get("solutions_found", []) == []


def test_single_solution_problem_still_solves_immediately():
    sid = new_session("(x+2)/4 = 3")
    body = step(sid, "x = 10")
    assert body["verified_facts"]["solution_status"] == "complete"
    assert body["state"]["solved"] is True
