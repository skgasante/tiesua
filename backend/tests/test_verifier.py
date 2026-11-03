import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from fastapi.testclient import TestClient

from backend.app.main import app

client = TestClient(app)
PROBLEM = "(x+2)/4 = 3"


def new_session() -> str:
    r = client.post("/v1/sessions", json={"problem": PROBLEM})
    assert r.status_code == 201, r.text
    return r.json()["session_id"]


def step(sid: str, text: str) -> dict:
    r = client.post(f"/v1/sessions/{sid}/step", json={"input": text})
    assert r.status_code == 200, r.text
    return r.json()


# ---------------------------------------------------------- happy path
def test_valid_operation_recognised():
    body = step(new_session(), "Multiply both sides by four.")
    assert body["action_type"] == "operation"
    assert body["verdict"] == "valid"
    assert body["verified_facts"]["expected_equation_text"] == "x + 2 = 12"
    # State does not advance until the learner states the result.
    assert body["state"]["equation_text"] == "(x + 2)/4 = 3"


def test_wrong_resulting_equation_rejected_and_state_preserved():
    sid = new_session()
    step(sid, "Multiply both sides by four.")
    body = step(sid, "x plus two equals seven")
    assert body["action_type"] == "resulting_equation"
    assert body["verdict"] == "invalid"
    assert body["error_category"] == "transformation-incorrect"
    assert body["state"]["equation_text"] == "(x + 2)/4 = 3"


def test_correct_resulting_equation_advances_state():
    sid = new_session()
    step(sid, "Multiply both sides by four.")
    body = step(sid, "x plus two equals twelve")
    assert body["verdict"] == "valid"
    assert body["state"]["equation_text"] == "x + 2 = 12"


def test_correct_final_answer_solves():
    sid = new_session()
    step(sid, "x plus two equals twelve")
    body = step(sid, "x equals ten")
    assert body["action_type"] == "final_answer"
    assert body["verdict"] == "valid"
    assert body["state"]["solved"] is True


def test_full_solution_sequence_in_symbols():
    sid = new_session()
    assert step(sid, "multiply both sides by 4")["verdict"] == "valid"
    assert step(sid, "x+2=12")["verdict"] == "valid"
    assert step(sid, "subtract 2 from both sides")["verdict"] == "valid"
    assert step(sid, "x=10")["state"]["solved"] is True


# ---------------------------------------------------------- equivalence
def test_equivalent_rearrangement_accepted():
    # Sides swapped: same equation, same solution.
    body = step(new_session(), "3 = (x+2)/4")
    assert body["verdict"] == "valid"


def test_equivalent_fraction_form_accepted():
    body = step(new_session(), "(2x+4)/8 = 3")
    assert body["verdict"] == "valid"  # same solution x=10, exact rational check


def test_incorrect_final_answer_rejected():
    body = step(new_session(), "x = 9")
    assert body["verdict"] == "invalid"
    assert body["error_category"] == "final-answer-incorrect"
    assert body["state"]["solved"] is False


# ---------------------------------------------------------- classification
def test_conceptual_question_classified():
    body = step(new_session(), "Why do we multiply both sides by four?")
    assert body["action_type"] == "question"
    assert body["verdict"] == "unsupported"


def test_navigation_command_classified():
    body = step(new_session(), "repeat the problem")
    assert body["action_type"] == "navigation"
    assert body["verified_facts"]["command"] == "repeat-problem"


def test_bare_expression_is_ambiguous():
    body = step(new_session(), "ten")
    assert body["verdict"] == "clarification_needed"
    assert body["error_category"] == "ambiguous-input"


def test_contextual_operation_applies_to_both_sides():
    body = step(new_session(), "multiply by four")
    assert body["verdict"] == "valid"
    assert body["action_type"] == "operation"
    assert body["state"]["pending_operation"] == "multiply both sides by 4"


def test_empty_input_incomplete():
    body = step(new_session(), "   ")
    assert body["verdict"] == "incomplete"


def test_malformed_expression_incomplete():
    body = step(new_session(), "x plus")
    assert body["verdict"] in ("incomplete", "clarification_needed", "unsupported")


def test_unknown_variable_unsupported():
    body = step(new_session(), "y + 2 = 12")
    assert body["verdict"] == "unsupported"


# ---------------------------------------------------------- safety
def test_code_execution_attempt_never_runs():
    body = step(new_session(), "__import__('os').system('echo hacked')")
    assert body["verdict"] in ("unsupported", "incomplete", "clarification_needed")
    assert body["state"]["equation_text"] == "(x + 2)/4 = 3"


def test_eval_attempt_rejected():
    body = step(new_session(), "eval(x+2)")
    assert body["verdict"] in ("unsupported", "incomplete", "clarification_needed")


def test_extremely_large_input_rejected():
    sid = new_session()
    r = client.post(f"/v1/sessions/{sid}/step", json={"input": "x+" * 400 + "1"})
    assert r.status_code in (200, 422)
    if r.status_code == 200:
        assert r.json()["verdict"] in ("unsupported", "incomplete")


def test_division_by_zero_operation_invalid():
    body = step(new_session(), "divide both sides by zero")
    assert body["verdict"] == "invalid"
    assert body["error_category"] == "division-by-zero"


def test_division_by_zero_expression_invalid():
    body = step(new_session(), "x/0 = 3")
    assert body["verdict"] == "invalid"
    assert body["error_category"] == "division-by-zero"


def test_multiply_by_zero_invalid():
    body = step(new_session(), "multiply both sides by 0")
    assert body["verdict"] == "invalid"
    assert body["error_category"] == "equivalence-breaking-operation"


def test_invalid_step_never_overwrites_verified_state():
    sid = new_session()
    step(sid, "x+2=12")
    before = client.get(f"/v1/sessions/{sid}").json()["state"]["equation_text"]
    step(sid, "x+2=100")
    after = client.get(f"/v1/sessions/{sid}").json()["state"]["equation_text"]
    assert before == after == "x + 2 = 12"


def test_hundred_number_words_are_understood():
    # Found by the real-browser journey: "one hundred" must check as
    # mathematics, not fall into "unsupported".
    r = client.post("/v1/sessions", json={"problem": "x+5 = 12"})
    sid = r.json()["session_id"]
    body = step(sid, "x plus five equals one hundred")
    assert body["verdict"] == "invalid"
    assert body["error_category"] == "transformation-incorrect"
    r2 = client.post("/v1/sessions", json={"problem": "x+5 = 105"})
    sid2 = r2.json()["session_id"]
    assert step(sid2, "x equals one hundred")["state"]["solved"] is True


def test_minus_signs_survive_word_conversion():
    # Regression: hyphen handling must never turn subtraction into
    # implicit multiplication (x-3 was once parsed as x*3).
    r = client.post("/v1/sessions", json={"problem": "x-4 = 9"})
    assert r.status_code == 201, r.text
    sid = r.json()["session_id"]
    assert r.json()["state"]["equation_text"] == "x - 4 = 9"
    assert step(sid, "x=13")["state"]["solved"] is True


def test_exact_fraction_arithmetic():
    # (x+1)/3 = 2 -> multiply by 3 -> x+1 = 6 -> x = 5, all exact.
    r = client.post("/v1/sessions", json={"problem": "(x+1)/3 = 2"})
    sid = r.json()["session_id"]
    assert step(sid, "multiply both sides by three")["verdict"] == "valid"
    assert step(sid, "x+1=6")["verdict"] == "valid"
    assert step(sid, "x=5")["state"]["solved"] is True


# ---------------------------------------------------------- tutor honesty
def test_tutor_without_credentials_is_labelled_scripted(monkeypatch):
    monkeypatch.delenv("MODEL_API_KEY", raising=False)
    monkeypatch.delenv("META_API_KEY", raising=False)
    monkeypatch.delenv("TIESUA_TUTOR_MOCK", raising=False)
    sid = new_session()
    step(sid, "multiply both sides by four")
    r = client.post(f"/v1/sessions/{sid}/tutor", json={})
    body = r.json()
    assert body["source"] == "fallback-scripted"
    assert "not live AI" in body["text"]


def test_tutor_mock_identifies_itself(monkeypatch):
    monkeypatch.setenv("TIESUA_TUTOR_MOCK", "1")
    sid = new_session()
    r = client.post(f"/v1/sessions/{sid}/tutor", json={"question": "Why?"})
    body = r.json()
    assert body["source"] == "mock"
    assert "Mock tutor" in body["text"]
