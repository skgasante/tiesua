import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)


def new_session(problem: str = "x+2 = 12") -> str:
    r = client.post("/v1/sessions", json={"problem": problem})
    assert r.status_code == 201, r.text
    return r.json()["session_id"]


def step(sid: str, text: str) -> dict:
    r = client.post(f"/v1/sessions/{sid}/step", json={"input": text})
    assert r.status_code == 200, r.text
    return r.json()


def test_multiply_by_one_is_equivalence_preserving_not_flagged():
    body = step(new_session(), "multiply both sides by one")
    assert body["verdict"] == "valid"
    assert body["verified_facts"]["equivalence_class"] == "equivalence-preserving"
    assert body["verified_facts"]["conditions"] == []
    assert "extraneous" not in body["message"].lower()


def test_multiply_by_nonzero_constant_is_equivalence_preserving():
    body = step(new_session(), "multiply both sides by four")
    assert body["verified_facts"]["equivalence_class"] == "equivalence-preserving"
    assert body["verified_facts"]["conditions"] == []


def test_multiply_by_x_flags_possible_extraneous_solutions():
    body = step(new_session(), "multiply both sides by x")
    assert body["verdict"] == "valid"
    assert body["verified_facts"]["equivalence_class"] == "may-introduce-extraneous-solutions"


def test_multiply_by_x_result_accepted_but_extraneous_answer_rejected():
    sid = new_session()
    step(sid, "multiply both sides by x")
    body = step(sid, "x(x+2) = 12x")
    assert body["verdict"] == "valid"
    assert body["verified_facts"].get("equivalence_class") == "introduces-extraneous-solutions"
    assert body["state"].get("extraneous_check_required") is True
    # x = 0 satisfies the multiplied equation but NOT the original.
    rejected = step(sid, "x = 0")
    assert rejected["verdict"] == "invalid"
    assert rejected["state"]["solved"] is False
    # The genuine solution still solves.
    accepted = step(sid, "x = 10")
    assert accepted["verdict"] == "valid"
    assert accepted["state"]["solved"] is True


def test_divide_by_x_records_restriction_and_lost_solution():
    sid = new_session("x*x = 3x")
    op = step(sid, "divide both sides by x")
    assert op["verdict"] == "valid"
    assert op["verified_facts"]["equivalence_class"] == "introduces-restriction"
    assert "x != 0" in op["verified_facts"]["conditions"]
    body = step(sid, "x = 3")
    # x=3 is reached conditionally; the divided-out case x=0 is a lost
    # solution of the original equation and must be preserved.
    assert body["state"].get("restrictions") == ["x != 0"]
    assert "0" in body["verified_facts"].get("lost_solutions", [])


def test_divide_by_x_expression_records_its_zero_condition():
    body = step(new_session(), "divide both sides by x plus two")
    assert body["verdict"] == "valid"
    assert any("x + 2" in c for c in body["verified_facts"]["conditions"])


def test_final_answer_checked_against_original_after_restriction():
    sid = new_session("x*x = 3x")
    step(sid, "divide both sides by x")
    step(sid, "x = 3")
    # Restart the same restricted path, then offer the lost solution:
    # it satisfies the original equation and must not be called wrong.
    sid2 = new_session("x*x = 3x")
    step(sid2, "divide both sides by x")
    body = step(sid2, "x = 0")
    assert body["verdict"] == "valid"
