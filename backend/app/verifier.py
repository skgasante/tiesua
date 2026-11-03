"""Step verification: a learner solution is a sequence of verified
states and transformations, never a bag of isolated answers.

An invalid step never overwrites the last verified state. Equivalence
is decided with exact symbolic arithmetic (difference-ratio and
solution-set checks in SymPy); random numerical substitution is not
used as proof. Unsupported or ambiguous input returns indeterminate
verdicts instead of invented ones.
"""
from __future__ import annotations

import re
import uuid
from dataclasses import dataclass, field

import sympy as sp

from .mathparse import MathParseError, X, parse_math, to_sympy, words_to_symbols

VERDICTS = ("valid", "invalid", "incomplete", "unsupported", "clarification_needed")
ACTION_TYPES = ("operation", "resulting_equation", "final_answer", "question", "navigation", "incomplete_input")


def expr_text(expr: sp.Expr) -> str:
    return str(expr).replace("**", "^")


def eq_text(eq: sp.Eq) -> str:
    return f"{expr_text(eq.lhs)} = {expr_text(eq.rhs)}"


@dataclass
class Session:
    problem: str
    original: sp.Eq
    current: sp.Eq
    solved: bool = False
    pending_operation: dict | None = None
    history: list[dict] = field(default_factory=list)
    step_count: int = 0
    # Domain restrictions accumulated from divisions (e.g. x != 0) and
    # whether later steps may have introduced extraneous solutions, in
    # which case final answers are checked against the ORIGINAL
    # equation, not merely the current one.
    restrictions: list[str] = field(default_factory=list)
    extraneous_check_required: bool = False
    current_input: str = ""
    last_facts: dict = field(default_factory=dict)
    # Snapshots taken BEFORE each accepted state-changing step, so a
    # learner-requested rollback is a verified backend operation,
    # not a frontend state replacement.
    state_stack: list[dict] = field(default_factory=list)
    # Individual verified solutions found so far. `solved` means the
    # COMPLETE solution set of the original problem has been found.
    found_solutions: list = field(default_factory=list)


_SESSIONS: dict[str, Session] = {}


def create_session(problem: str) -> tuple[str, Session]:
    node = parse_math(words_to_symbols(problem))
    eq = to_sympy(node)
    if not isinstance(eq, sp.Eq):
        raise MathParseError("A problem must be an equation, like (x+2)/4 = 3.", "unsupported")
    # Bound memory: keep at most 1000 live sessions, evicting oldest.
    while len(_SESSIONS) >= 1000:
        _SESSIONS.pop(next(iter(_SESSIONS)))
    sid = uuid.uuid4().hex
    session = Session(problem=problem, original=eq, current=eq)
    from . import shared_store, session_storage
    if shared_store.enabled():
        session_storage.save(sid, session)
    else:
        _SESSIONS[sid] = session
    return sid, session


def get_session(sid: str) -> Session | None:
    from . import shared_store, session_storage
    return session_storage.load(sid) if shared_store.enabled() else _SESSIONS.get(sid)


def _push_snapshot(session: Session) -> None:
    session.state_stack.append({
        "current": session.current,
        "pending_operation": session.pending_operation,
        "solved": session.solved,
        "found_solutions": list(session.found_solutions),
        "restrictions": list(session.restrictions),
        "extraneous_check_required": session.extraneous_check_required,
        "step_count": session.step_count,
    })


def undo_last_step(session: Session) -> dict:
    """Verified rollback owned by the backend: restores the exact
    state before the last accepted step and records the rollback in
    history so tutoring context stays consistent."""
    if not session.state_stack:
        return _result(session, "navigation", "unsupported",
                       "There is no earlier step to go back to yet.", None, {"command": "undo"})
    snap = session.state_stack.pop()
    session.current = snap["current"]
    session.pending_operation = snap["pending_operation"]
    session.solved = snap["solved"]
    session.found_solutions = snap["found_solutions"]
    session.restrictions = snap["restrictions"]
    session.extraneous_check_required = snap["extraneous_check_required"]
    session.step_count = snap["step_count"]
    return _result(session, "navigation", "valid",
                   f"Gone back. Your equation is {eq_text(session.current)} again.", None, {"command": "undo"})


def state_payload(session: Session) -> dict:
    return {
        "equation_text": eq_text(session.current),
        "problem_text": eq_text(session.original),
        "solved": session.solved,
        "step_index": session.step_count,
        "pending_operation": session.pending_operation["description"] if session.pending_operation else None,
        "restrictions": list(session.restrictions),
        "extraneous_check_required": session.extraneous_check_required,
        "solutions_found": sorted(expr_text(s) for s in session.found_solutions),
    }


# ------------------------------------------------------------ equivalence
def _solution_set(eq: sp.Eq) -> set | None:
    try:
        sols = sp.solve(eq, X, dict=False)
        return set(sols) if isinstance(sols, list) else None
    except Exception:
        return None


def equations_equivalent(a: sp.Eq, b: sp.Eq) -> bool:
    """Exact equivalence for one-unknown equations: the differences
    must be non-zero constant multiples, or solution sets identical."""
    diff_a = sp.simplify(a.lhs - a.rhs)
    diff_b = sp.simplify(b.lhs - b.rhs)
    if diff_a == 0 or diff_b == 0:
        return diff_a == 0 and diff_b == 0
    try:
        ratio = sp.simplify(diff_a / diff_b)
        if ratio.is_number and ratio != 0:
            return True
    except Exception:
        pass
    sa, sb = _solution_set(a), _solution_set(b)
    return sa is not None and sa == sb


def denominators_with_x(eq: sp.Eq) -> list[str]:
    restrictions: list[str] = []
    for side in (eq.lhs, eq.rhs):
        for term in sp.Add.make_args(sp.together(side)):
            den = sp.denom(term)
            if den != 1 and den.has(X):
                restrictions.append(f"{expr_text(den)} != 0")
    return restrictions


# ------------------------------------------------------------ operations
_OP_PATTERNS = [
    (re.compile(r"^(?:please\s+)?(?:multiply|times)\s+(?:both\s+sides\s+)?by\s+(.+)$"), "multiply"),
    (re.compile(r"^(?:please\s+)?divide\s+both\s+sides\s+by\s+(.+)$"), "divide"),
    (re.compile(r"^(?:please\s+)?add\s+(.+?)\s+to\s+both\s+sides$"), "add"),
    (re.compile(r"^(?:please\s+)?(?:subtract|take away)\s+(.+?)\s+from\s+both\s+sides$"), "subtract"),
]
_OP_WORDS = ("multiply", "divide", "add", "subtract")


def _parse_operation(text: str) -> dict | None:
    lowered = text.lower().strip().rstrip(".")
    for pattern, op in _OP_PATTERNS:
        m = pattern.match(lowered)
        if m:
            operand_node = parse_math(words_to_symbols(m.group(1)))
            if operand_node.kind == "equation":
                raise MathParseError("An operation needs one amount, like 'multiply both sides by four'.")
            operand = to_sympy(operand_node)
            return {"op": op, "operand": operand, "description": f"{op} both sides by {expr_text(operand)}"}
    if any(lowered.startswith(w) for w in _OP_WORDS) or "both sides" in lowered:
        return {"op": "incomplete"}
    return None


def apply_operation(session: Session, operation: dict) -> dict:
    operand: sp.Expr = operation["operand"]
    op = operation["op"]
    if op == "divide" and sp.simplify(operand) == 0:
        return _result(session, "operation", "invalid", "That operation divides by zero, which is not allowed. Your equation has not changed.", "division-by-zero")
    if op == "multiply" and sp.simplify(operand) == 0:
        return _result(session, "operation", "invalid", "Multiplying both sides by zero would destroy the equation, so TieSua cannot accept that step. Your equation has not changed.", "equivalence-breaking-operation")
    eq_class = "equivalence-preserving"
    conditions: list[str] = []
    if operand.has(X):
        if op == "divide":
            eq_class = "introduces-restriction"
            conditions.append(f"{expr_text(operand)} != 0")
        elif op == "multiply":
            eq_class = "may-introduce-extraneous-solutions"
    expected = _apply(session.current, op, operand)
    _push_snapshot(session)
    session.pending_operation = {**operation, "description": operation["description"],
                                 "conditions": conditions, "equivalence_class": eq_class}
    session.step_count += 1
    message = f"That is a valid operation: {operation['description']}. It keeps the equation balanced."
    if eq_class == "introduces-restriction":
        message += f" Note: this only holds while {conditions[0]}."
    elif eq_class == "may-introduce-extraneous-solutions":
        message += " Note: multiplying by an expression containing x can add false solutions, so we will check the final answer carefully."
    message += " Now tell me the equation you get, and I will check it."
    return _result(session, "operation", "valid", message, None,
                   {"equivalence_class": eq_class, "conditions": conditions, "expected_equation_text": eq_text(expected)})


def _apply(eq: sp.Eq, op: str, operand: sp.Expr) -> sp.Eq:
    if op == "multiply":
        return sp.Eq(sp.simplify(eq.lhs * operand), sp.simplify(eq.rhs * operand))
    if op == "divide":
        return sp.Eq(sp.simplify(eq.lhs / operand), sp.simplify(eq.rhs / operand))
    if op == "add":
        return sp.Eq(sp.simplify(eq.lhs + operand), sp.simplify(eq.rhs + operand))
    return sp.Eq(sp.simplify(eq.lhs - operand), sp.simplify(eq.rhs - operand))


# ------------------------------------------------------------ classification
_QUESTION_STARTS = ("why", "how", "what", "can you", "explain", "help", "i don't", "i dont", "please explain")
_NAVIGATION = {
    "repeat": "repeat-current", "repeat that": "repeat-current", "hear again": "repeat-current",
    "repeat the problem": "repeat-problem", "repeat problem": "repeat-problem",
    "repeat the current step": "repeat-current", "repeat current step": "repeat-current",
    "stop": "stop", "help": "help", "start again": "restart",
}


def _result(session: Session, action: str, verdict: str, message: str, category: str | None,
            facts: dict | None = None) -> dict:
    payload = {
        "action_type": action,
        "verdict": verdict,
        "error_category": category,
        "message": message,
        "verified_facts": facts or {},
        "state": state_payload(session),
    }
    session.last_facts = facts or {}
    session.history.append({"action_type": action, "verdict": verdict,
                            "error_category": category, "input": session.current_input[:160]})
    return payload


def pending_expected(session: Session) -> sp.Eq | None:
    """The equation that correctly results from the pending operation,
    computed by the verifier (never by the language model)."""
    if not session.pending_operation or "operand" not in session.pending_operation:
        return None
    try:
        return _apply(session.current, session.pending_operation["op"], session.pending_operation["operand"])
    except Exception:
        return None


def submit_step(session: Session, raw_input: str) -> dict:
    text = (raw_input or "").strip()
    session.current_input = text
    if not text:
        return _result(session, "incomplete_input", "incomplete", "I didn't receive a step yet. Type an operation, an equation, a final answer, or a question.", None)
    lowered = text.lower().rstrip(".")
    if lowered in _NAVIGATION:
        return _result(session, "navigation", "valid", f"Navigation command received: {_NAVIGATION[lowered]}.", None, {"command": _NAVIGATION[lowered]})
    if text.endswith("?") or lowered.startswith(_QUESTION_STARTS) or re.search(r"\b(?:don.t understand|do not understand|confused|help me|explain|hint)\b", lowered):
        return _result(session, "question", "unsupported", "That is a question, not a mathematical step. The tutor can help with it.", None, {"question": text})

    # 1. Proposed operation (natural language).
    try:
        operation = _parse_operation(text)
    except MathParseError as exc:
        verdict = "unsupported" if exc.kind == "unsupported" else "incomplete"
        return _result(session, "operation", verdict, str(exc), "unsupported-expression" if verdict == "unsupported" else None)
    if operation is not None:
        if operation["op"] == "incomplete":
            return _result(session, "operation", "clarification_needed",
                           "I heard an operation, but I need to know that it applies to both sides, and by how much. Try: 'multiply both sides by four'.",
                           "operation-incomplete")
        return apply_operation(session, operation)

    # 2-5. Mathematical input: resulting equation, final answer, or bare expression.
    try:
        math_text = re.sub(r"^the answer is\s+", "x equals ", text, flags=re.I)
        node = parse_math(words_to_symbols(math_text))
        value = to_sympy(node)
    except MathParseError as exc:
        if exc.kind == "division-by-zero":
            return _result(session, "incomplete_input", "invalid", str(exc), "division-by-zero")
        verdict = "unsupported" if exc.kind == "unsupported" else "incomplete"
        category = "unsupported-expression" if verdict == "unsupported" else None
        return _result(session, "incomplete_input", verdict, str(exc), category)

    if not isinstance(value, sp.Eq):
        return _result(session, "incomplete_input", "clarification_needed",
                       "I heard a mathematical expression on its own. Do you mean that is the value of x, or part of an equation? Try writing the whole equation, like 'x plus two equals twelve'.",
                       "ambiguous-input")

    eq: sp.Eq = value
    # A numerical equality with no unknown is an arithmetic
    # statement, never a transformation of the working equation.
    # True or false, it must not replace the active problem, clear
    # a pending operation, or count as progress.
    if not eq.lhs.has(X) and not eq.rhs.has(X):
        holds = sp.simplify(eq.lhs - eq.rhs) == 0
        if holds:
            return _result(session, "incomplete_input", "valid",
                           f"That sum is true: {eq_text(eq)}. But it is a separate sum, not a step in our equation, so your equation has not changed.",
                           None, {"arithmetic_statement": "identity", "statement": eq_text(eq)})
        return _result(session, "incomplete_input", "invalid",
                       f"That sum is not true: {eq_text(eq)} does not hold. It is separate from our equation, so your equation has not changed.",
                       "arithmetic-incorrect", {"arithmetic_statement": "contradiction", "statement": eq_text(eq)})

    # Final answer form: one side is exactly x, the other has no x.
    # Final answers are always checked against the ORIGINAL problem,
    # so solutions introduced by later steps (extraneous) or excluded
    # by restrictions (lost cases) are handled correctly.
    is_final_form = (eq.lhs == X and not eq.rhs.has(X)) or (eq.rhs == X and not eq.lhs.has(X))
    if is_final_form:
        answer = eq.rhs if eq.lhs == X else eq.lhs
        # Preserve any pending division restriction in the record.
        if session.pending_operation:
            for cond in session.pending_operation.get("conditions", []):
                if cond not in session.restrictions:
                    session.restrictions.append(cond)
        satisfies_original = sp.simplify((session.original.lhs - session.original.rhs).subs(X, answer)) == 0
        satisfies_current = sp.simplify((session.current.lhs - session.current.rhs).subs(X, answer)) == 0
        orig_sols = _solution_set(session.original)
        if orig_sols:
            # Solution-set aware handling: valid individual solution,
            # partial set, complete set, and extraneous value are
            # four different outcomes.
            in_original = any(sp.simplify(answer - s) == 0 for s in orig_sols)
            if in_original:
                if not any(sp.simplify(answer - f) == 0 for f in session.found_solutions):
                    _push_snapshot(session)
                    session.found_solutions.append(answer)
                remaining = [s for s in orig_sols
                             if not any(sp.simplify(s - f) == 0 for f in session.found_solutions)]
                session.pending_operation = None
                session.step_count += 1
                found_texts = sorted(expr_text(s) for s in session.found_solutions)
                facts: dict = {"answer": expr_text(answer), "solutions_found": found_texts,
                               "solutions_remaining": len(remaining)}
                if session.restrictions:
                    facts["restrictions"] = list(session.restrictions)
                    if remaining:
                        facts["lost_solutions"] = sorted(expr_text(s) for s in remaining)
                if not remaining:
                    _push_snapshot(session)
                    session.current = eq
                    session.solved = True
                    facts["solution_status"] = "complete"
                    return _result(session, "final_answer", "valid",
                                   f"Correct and complete: x = {', '.join(found_texts)}. That is the whole answer, and it works in the very first equation.",
                                   None, facts)
                facts["solution_status"] = "partial"
                return _result(session, "final_answer", "valid",
                               f"x = {expr_text(answer)} is one correct answer — well done. But there is still another answer to find, so we are not finished yet. Your equation has not changed.",
                               None, facts)
            if satisfies_current:
                return _result(session, "final_answer", "invalid",
                               "That value satisfies your latest equation but not the original problem - it is a false answer that crept in during an earlier step, so it is not counted. Your equation has not changed.",
                               "extraneous-solution", {"attempted_answer": expr_text(answer)})
            return _result(session, "final_answer", "invalid",
                           f"That final answer does not work in the first equation. Your equation is still {eq_text(session.current)}.",
                           "final-answer-incorrect", {"attempted_answer": expr_text(answer)})
        if satisfies_original:
            _push_snapshot(session)
            session.current = eq
            session.solved = True
            session.pending_operation = None
            session.step_count += 1
            return _result(session, "final_answer", "valid",
                           f"Correct. {eq_text(eq)} satisfies the original equation, verified exactly.", None,
                           {"answer": expr_text(answer), "solution_status": "complete"})
        if satisfies_current and session.extraneous_check_required:
            return _result(session, "final_answer", "invalid",
                           "That value satisfies your latest equation but not the original problem - it crept in during an earlier step, so it is not accepted. Your verified equation has not changed.",
                           "extraneous-solution", {"attempted_answer": expr_text(answer)})
        return _result(session, "final_answer", "invalid",
                       f"That final answer does not work in the first equation. Your equation is still {eq_text(session.current)}.",
                       "final-answer-incorrect", {"attempted_answer": expr_text(answer)})

    # Resulting equation: compare exact solution sets with the
    # verified state. Equivalent -> accepted outright. Superset ->
    # accepted, flagged as introducing extraneous solutions. Subset
    # -> accepted conditionally, with lost solutions and domain
    # restrictions preserved. Anything else -> rejected, state kept.
    new_restrictions = denominators_with_x(eq)
    if session.pending_operation:
        for cond in session.pending_operation.get("conditions", []):
            if cond not in new_restrictions:
                new_restrictions.append(cond)
    if equations_equivalent(eq, session.current):
        _push_snapshot(session)
        session.current = eq
        session.pending_operation = None
        session.step_count += 1
        for r in new_restrictions:
            if r not in session.restrictions:
                session.restrictions.append(r)
        facts = {"equivalence_class": "equivalence-preserving"}
        if new_restrictions:
            facts["restrictions"] = new_restrictions
        return _result(session, "resulting_equation", "valid",
                       "That equation is correct - it has exactly the same solution as your verified equation, so your step is accepted.",
                       None, facts)

    sols_current = _solution_set(session.current)
    sols_candidate = _solution_set(eq)
    if sols_current is not None and sols_candidate is not None:
        # A different solution set alone does not prove the learner carried
        # out a valid operation. Require a verifier-calculated pending result.
        if sols_current != sols_candidate:
            expected = pending_expected(session)
            if expected is None or not equations_equivalent(eq, expected):
                return _result(session, "resulting_equation", "invalid",
                               "That equation changes the possible answers, and I cannot verify it from the operation we chose. Your equation has not changed.",
                               "transformation-incorrect", {"attempted_equation_text": eq_text(eq)})
        if sols_current < sols_candidate:
            added = sorted(expr_text(s) for s in sols_candidate - sols_current)
            _push_snapshot(session)
            session.current = eq
            session.pending_operation = None
            session.step_count += 1
            session.extraneous_check_required = True
            for r in new_restrictions:
                if r not in session.restrictions:
                    session.restrictions.append(r)
            return _result(session, "resulting_equation", "valid",
                           "That transformation is worked out correctly, but it is not equivalence-preserving: it can add solutions that the original equation does not have. TieSua will check any final answer against the original problem.",
                           None, {"equivalence_class": "introduces-extraneous-solutions", "solutions_added": added})
        if sols_candidate < sols_current:
            lost = sorted(expr_text(s) for s in sols_current - sols_candidate)
            _push_snapshot(session)
            session.current = eq
            session.pending_operation = None
            session.step_count += 1
            for r in new_restrictions:
                if r not in session.restrictions:
                    session.restrictions.append(r)
            return _result(session, "resulting_equation", "valid",
                           f"That step is accepted with a condition: it sets aside the case(s) {', '.join(lost)}, which also satisfied the previous equation. TieSua has kept a note of that case, and any final answer is still checked against the original problem.",
                           None, {"equivalence_class": "excludes-solutions-unless-restricted",
                                  "lost_solutions": lost, "restrictions": list(session.restrictions)})
    if sols_current is None or sols_candidate is None:
        return _result(session, "resulting_equation", "unsupported",
                       "TieSua cannot yet verify that transformation exactly, so it has not been accepted or marked wrong. Try a smaller step.",
                       None, {"attempted_equation_text": eq_text(eq)})
    return _result(session, "resulting_equation", "invalid",
                   "That resulting equation is not equivalent to your verified equation, so it would change the answer. Your verified equation has not changed.",
                   "transformation-incorrect",
                   {"attempted_equation_text": eq_text(eq)})

