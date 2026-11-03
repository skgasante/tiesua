"""Stage 1: mathematical truth and verified context.

Independent requirements (not implementation snapshots):
- A numerical equality with no unknown, true or false, must never
  replace the active working equation, clear a pending operation,
  advance the step count, or mark anything solved.
- TieSua's own approved spoken forms must parse back to the same
  mathematics when a learner repeats them.
- The orchestrator's model context must always contain the verified
  result, however long the lesson content is.
- A model reply may not contradict verified facts or claim
  completion / state a final answer while work is unfinished.
"""
from backend.app.mathparse import words_to_symbols
from backend.app.orchestrator import _context_for_model, _validate_plan
from backend.app.verifier import create_session, submit_step


def _guided():
    _sid, s = create_session("(x+2)/4 = 3")
    r = submit_step(s, "multiply both sides by four")
    assert r["verdict"] == "valid"
    return s


def test_false_arithmetic_never_corrupts_the_equation():
    s = _guided()
    before_steps = s.step_count
    r = submit_step(s, "three times four makes thirteen")
    assert r["verdict"] == "invalid"
    assert r["verified_facts"]["arithmetic_statement"] == "contradiction"
    assert r["state"]["equation_text"] == "(x + 2)/4 = 3"
    assert r["state"]["pending_operation"] is not None
    assert r["state"]["solved"] is False
    assert s.step_count == before_steps


def test_true_arithmetic_is_true_but_not_a_step():
    s = _guided()
    before_steps = s.step_count
    r = submit_step(s, "three times four makes twelve")
    assert r["verdict"] == "valid"  # the sum itself is true
    assert r["verified_facts"]["arithmetic_statement"] == "identity"
    assert r["state"]["equation_text"] == "(x + 2)/4 = 3"  # not 12 = 12
    assert r["state"]["pending_operation"] is not None
    assert s.step_count == before_steps


def test_bare_numerical_equalities_never_replace_the_problem():
    for text, verdict in [("twelve equals twelve", "valid"),
                          ("twelve equals thirteen", "invalid")]:
        s = _guided()
        r = submit_step(s, text)
        assert r["verdict"] == verdict, text
        assert r["state"]["equation_text"] == "(x + 2)/4 = 3", text
        assert r["state"]["solved"] is False, text


def test_problem_survives_arithmetic_and_still_solves():
    s = _guided()
    submit_step(s, "three times four makes thirteen")
    submit_step(s, "twelve equals twelve")
    r = submit_step(s, "x plus two equals twelve")
    assert r["verdict"] == "valid" and r["state"]["equation_text"] == "x + 2 = 12"
    submit_step(s, "two plus two equals four")
    assert s.current.lhs is not None and r["state"]["solved"] is False
    r = submit_step(s, "subtract two from both sides")
    assert r["verdict"] == "valid"
    r = submit_step(s, "x equals ten")
    assert r["verdict"] == "valid" and r["state"]["solved"] is True


def test_correct_and_incorrect_intermediate_transformations():
    s = _guided()
    r = submit_step(s, "x plus two equals seven")
    assert r["verdict"] == "invalid"
    assert r["state"]["equation_text"] == "(x + 2)/4 = 3"
    r = submit_step(s, "x plus two equals twelve")
    assert r["verdict"] == "valid"
    assert r["state"]["equation_text"] == "x + 2 = 12"
    assert r["state"]["solved"] is False  # intermediate, not mastery


def test_spoken_round_trip_all_over_equals():
    assert words_to_symbols("x plus two, all over four, equals three") == "(x + 2) / (4) = 3"
    _sid, s = create_session("x plus two, all over four, equals three")
    assert s.original.lhs is not None
    from backend.app.verifier import eq_text
    assert eq_text(s.original) == "(x + 2)/4 = 3"


def test_spoken_round_trip_supported_structures():
    cases = {
        "x, plus two over four, equals three": "x + 2/4 = 3",
        "three times open bracket x plus two close bracket equals fourteen": "3*(x + 2) = 14",
        "x minus negative three equals five": "x - -3 = 5",
        "x to the power of two equals nine": "x^2 = 9",
    }
    for spoken, symbols in cases.items():
        assert words_to_symbols(spoken).replace(" ", "") == symbols.replace(" ", ""), spoken


def test_context_never_truncates_verified_state():
    ctx = {
        "screen": "lesson", "stage": "guided",
        "equation": "x + 2 = 12",
        "pending_operation": "multiply both sides by 4",
        "lesson_content": "z" * 5000,
        "verified_result": {"verdict": "invalid", "equation_now": "x + 2 = 12"},
    }
    text = _context_for_model(ctx)
    assert "verified_result" in text and "invalid" in text
    assert "pending_operation" in text
    assert len(text) <= 4000


def test_reply_guard_blocks_false_confirmation_and_completion():
    verified = {"verdict": "invalid", "equation_now": "(x + 2)/4 = 3"}
    plan = _validate_plan({"actions": [], "teachingMove": "hint", "confidence": 0.9,
                           "reply": "That's right. x = 10."}, verified)
    assert plan is not None and plan["reply"] == ""
    plan = _validate_plan({"actions": [], "teachingMove": "none", "confidence": 0.9,
                           "reply": "You have solved it now."},
                          {"verdict": "valid", "equation_now": "x + 2 = 12"})
    assert plan is not None and plan["reply"] == ""
    plan = _validate_plan({"actions": [], "teachingMove": "none", "confidence": 0.9,
                           "reply": "You have solved it. x = 10 is the answer."},
                          {"verdict": "solved", "equation_now": "x = 10"})
    assert plan is not None and "solved" in plan["reply"]
