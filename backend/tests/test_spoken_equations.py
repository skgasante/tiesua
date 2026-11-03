"""Spoken-equation regressions (owner-reported failures).

1. "x minus three is equal to fifteen" must be understood as the
   equation x - 3 = 15 and judged wrong against (x-3)/2 = 5 after
   multiplying by two (x - 3 = 10). It must never produce a
   complaint about the letter "i".
2. A help question is classified as a question - never a step -
   and never changes the verified state.
"""
from backend.app.verifier import create_session, submit_step
from backend.app.mathparse import words_to_symbols


def _session(problem="(x-3)/2 = 5"):
    _sid, session = create_session(problem)
    return session


def test_is_equal_to_is_not_the_letter_i():
    assert "=" in words_to_symbols("x minus three is equal to fifteen")
    s = _session()
    r1 = submit_step(s, "multiply both sides by two")
    assert r1["verdict"] == "valid" and r1["action_type"] == "operation"
    r2 = submit_step(s, "x minus three is equal to fifteen")
    assert r2["action_type"] == "resulting_equation"
    assert r2["verdict"] == "invalid"  # correct answer is x - 3 = 10
    assert "i" not in r2["message"].split("know")[-1][:3]
    assert "doesn't know" not in r2["message"]
    # State preserved: the correct resulting equation is accepted.
    r3 = submit_step(s, "x minus three is equal to ten")
    assert r3["verdict"] == "valid"
    r4 = submit_step(s, "add three to both sides")
    assert r4["verdict"] == "valid"
    r5 = submit_step(s, "x is equal to thirteen")
    assert r5["verdict"] == "valid" and r5["state"]["solved"] is True


def test_help_question_never_changes_state():
    s = _session()
    before = s.current
    r = submit_step(s, "What do you expect me to do actually?")
    assert r["action_type"] == "question"
    assert s.current == before and s.solved is False and s.step_count == 0


def test_verbal_calculation_as_equation_side():
    # "three times four makes twelve" style statements parse as
    # equations of numbers, not unknown-letter errors.
    assert words_to_symbols("three times four makes twelve") == "3 * 4 = 12"
