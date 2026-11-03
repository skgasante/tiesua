"""Tutoring guidance. The verifier decides mathematical truth; this
module only explains it, with situation-aware instructional context:
what the learner just did, what is pending, what mistake is
mathematically established, and what the tutor should achieve next.
Live guidance calls a Meta model through Meta Model API. Scripted
fallback is always labelled as scripted — never disguised as live
AI. A deterministic mock exists only for tests (TIESUA_TUTOR_MOCK=1)
and identifies itself as a mock.
"""
from __future__ import annotations

import os
import re
import time

import httpx
import json
import threading
import sympy as sp

from .mathparse import parse_math, to_sympy
from .verifier import Session, eq_text, expr_text, pending_expected

DIAGNOSTICS: list[dict] = []


def live_ai_enabled() -> bool:
    """Immediate kill switch for ALL paid Meta calls:
    TIESUA_DISABLE_LIVE_AI=1. Checked on every paid path before any
    reservation or network call; the app then falls back honestly."""
    model = os.environ.get("META_MODEL") or os.environ.get("MODEL_NAME") or "muse-spark-1.3-contributor"
    return os.environ.get("TIESUA_DISABLE_LIVE_AI") != "1" and (
        not os.environ.get("VERCEL") or model == "muse-spark-1.3-contributor")


class MetaBudget:
    """Vercel uses shared, owner-controlled Redis reservations. Local
    development retains the historical test ceilings described below. Unlike
    the per-client rate limit, this cannot be bypassed by changing
    browser, session or client identifier: every paid call must
    reserve budget under one lock before it is made, so concurrent
    requests cannot race past the cap. Configure with
    TIESUA_BUDGET_MAX_CALLS, TIESUA_BUDGET_MAX_TOKENS and
    TIESUA_BUDGET_WINDOW_HOURS (rolling window, default 24h).
    NOTE: reservations track requested maximum output tokens, not
    billed tokens (which also include input) - a safeguard, not a
    guaranteed financial cap. For development, TIESUA_DEV_MAX_CALLS
    additionally caps total calls since process start."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._calls: list[float] = []
        self._tokens: list[tuple[float, int]] = []
        self._total_calls = 0

    def _prune(self, now: float) -> None:
        window = float(os.environ.get("TIESUA_BUDGET_WINDOW_HOURS", "24")) * 3600
        self._calls = [t for t in self._calls if now - t < window]
        self._tokens = [(t, n) for t, n in self._tokens if now - t < window]

    def reserve(self, requested_tokens: int) -> bool:
        from . import shared_store
        if shared_store.enabled():
            return live_ai_enabled() and shared_store.reserve(requested_tokens)
        import time as _time
        now = _time.monotonic()
        with self._lock:
            if not live_ai_enabled():
                return False
            # Explicit opt-in only: the owner has requested no call cap.
            # Retain the kill switch and accounting even in this mode.
            model = os.environ.get("META_MODEL") or os.environ.get("MODEL_NAME") or "muse-spark-1.3-contributor"
            unlimited = os.environ.get("TIESUA_UNLIMITED_CALLS") == "1" and model == "muse-spark-1.3-contributor"
            dev_cap = None if unlimited else os.environ.get("TIESUA_DEV_MAX_CALLS")
            if dev_cap is not None and self._total_calls >= int(dev_cap):
                return False
            self._prune(now)
            max_calls = int(os.environ.get("TIESUA_BUDGET_MAX_CALLS", "500"))
            max_tokens = int(os.environ.get("TIESUA_BUDGET_MAX_TOKENS", "400000"))
            if not unlimited and len(self._calls) >= max_calls:
                return False
            if not unlimited and sum(n for _, n in self._tokens) + requested_tokens > max_tokens:
                return False
            self._calls.append(now)
            self._tokens.append((now, requested_tokens))
            self._total_calls += 1
            return True

    def refund(self) -> None:
        from . import shared_store
        if shared_store.enabled():
            return
        with self._lock:
            if self._calls:
                self._calls.pop()
            if self._tokens:
                self._tokens.pop()
            if self._total_calls > 0:
                self._total_calls -= 1

    def status(self) -> dict:
        from . import shared_store
        if shared_store.enabled():
            return {**shared_store.budget_status(), "live_ai_enabled": live_ai_enabled()}
        import time as _time
        with self._lock:
            self._prune(_time.monotonic())
            return {
                "calls_used": len(self._calls),
                "tokens_reserved": sum(n for _, n in self._tokens),
                "total_calls_since_start": self._total_calls,
                "live_ai_enabled": live_ai_enabled(),
            }


BUDGET = MetaBudget()

_OBJECTIVES = {
    "operation-proposed-not-completed": (
        "The learner has ALREADY chosen the correct operation. Acknowledge that specific choice, "
        "then invite them to calculate what each side becomes and say the whole resulting equation. "
        "Do NOT ask which operation undoes anything — they already named it. Do not state the resulting equation."),
    "incorrect-result-after-valid-operation": (
        "The learner applied a valid operation but the resulting equation is wrong. Direct attention to the "
        "side of the equation where the working differs (see established_mistake), especially the calculation "
        "on that side, and invite them to work it again and restate the whole equation. Do NOT state the "
        "correct resulting equation or its values, and do not restart from choosing an operation."),
    "incorrect-step": (
        "The learner's step was not accepted. Point to the kind of slip the verifier established, without "
        "stating the correct result, and invite one smaller try from the verified equation."),
    "correct-intermediate-equation": (
        "The learner's equation is correct. Confirm the new state briefly and ask what single step would "
        "move x closer to being on its own. Do not repeat a suggestion the learner already made."),
    "partial-solution": (
        "The learner found one correct solution but the set is incomplete. Say it counts, and invite them "
        "to think about whether another value could also work, without naming it."),
    "solved": "The learner completed the verified solution set. Congratulate them specifically and invite a new problem.",
    "conceptual-question": (
        "Answer the learner's conceptual question plainly using the current verified equation as the example, "
        "in at most three short sentences, then invite them to try the next step."),
    "hint-request": (
        "Give ONE hint about the next useful move from the verified equation. Do not perform the whole "
        "step and do not state any resulting equation or final answer."),
    "explanation-request": (
        "Explain the current or last step in simple language: what was done to both sides and why it keeps "
        "the equation balanced. Then invite the learner to continue."),
    "general": "Encourage one small next step from the verified equation, in plain language.",
}


def build_context(session: Session, question: str | None = None) -> dict:
    last = session.history[-1] if session.history else None
    action = (last or {}).get("action_type")
    verdict = (last or {}).get("verdict")
    pending = session.pending_operation["description"] if session.pending_operation else None
    expected = pending_expected(session)

    mistake = None
    attempted_text = session.last_facts.get("attempted_equation_text")
    if verdict == "invalid" and attempted_text and expected is not None:
        try:
            attempted = to_sympy(parse_math(str(attempted_text)))
            if isinstance(attempted, sp.Eq):
                left_differs = sp.simplify(attempted.lhs - expected.lhs) != 0
                right_differs = sp.simplify(attempted.rhs - expected.rhs) != 0
                side = ("both sides" if left_differs and right_differs else
                        "the right-hand side" if right_differs else
                        "the left-hand side" if left_differs else "the working")
                mistake = {
                    "attempted_equation": str(attempted_text),
                    "differing_side": side,
                    "operation_that_was_applied": pending,
                    "kind": "resulting equation does not match correctly applying the valid operation",
                }
        except Exception:
            mistake = None

    q = (question or "").lower()
    if session.solved:
        situation = "solved"
    elif question and any(w in q for w in ("hint", "stuck", "help me", "nudge")):
        situation = "hint-request"
    elif question and any(w in q for w in ("explain", "why", "detail", "mean")):
        situation = "explanation-request" if "explain" in q or "detail" in q else "conceptual-question"
    elif question:
        situation = "conceptual-question"
    elif verdict == "valid" and action == "operation":
        situation = "operation-proposed-not-completed"
    elif verdict == "invalid" and action == "resulting_equation" and pending:
        situation = "incorrect-result-after-valid-operation"
    elif verdict == "invalid":
        situation = "incorrect-step"
    elif verdict == "valid" and action == "final_answer":
        situation = "partial-solution"
    elif verdict == "valid":
        situation = "correct-intermediate-equation"
    else:
        situation = "general"

    already_made = [h.get("input", "") for h in session.history
                    if h.get("action_type") == "operation" and h.get("verdict") == "valid"]
    return {
        "situation": situation,
        "instructional_objective": _OBJECTIVES[situation],
        "verified_equation": eq_text(session.current),
        "problem": eq_text(session.original),
        "solved": session.solved,
        "pending_operation": pending,
        "last_action": action,
        "verdict": verdict,
        "error_category": (last or {}).get("error_category"),
        "established_mistake": mistake,
        "solutions_found": [expr_text(s) for s in session.found_solutions],
        "restrictions": list(session.restrictions),
        "recent_history": session.history[-3:],
        "already_successfully_proposed": already_made,
        "learner_question": question,
        "_expected_equation": eq_text(expected) if expected is not None else None,
    }


def _public_context(context: dict) -> dict:
    return {k: v for k, v in context.items() if not k.startswith("_")}


def _fallback_text(session: Session, context: dict) -> str:
    eq = context["verified_equation"]
    situation = context["situation"]
    pending = context["pending_operation"]
    label = "Scripted guidance (not live AI): "
    if situation == "solved":
        return f"{label}You have completed it: {eq}. You can repeat the problem or choose another one."
    if situation == "operation-proposed-not-completed":
        return (f"{label}Yes — {pending} is the operation to use. Now work out what each side becomes, "
                "then tell me the whole new equation so I can check it.")
    if situation == "incorrect-result-after-valid-operation":
        mistake = context["established_mistake"] or {}
        side = mistake.get("differing_side", "the working")
        return (f"{label}Your operation was a good one, but the equation you gave is not what it produces. "
                f"Check the calculation on {side} once more, then tell me the whole equation again. "
                "We are still working from your verified equation.")
    if situation == "correct-intermediate-equation":
        return f"{label}That equation is correct, so we will keep it: {eq}. What one step would move x closer to being on its own?"
    if situation == "partial-solution":
        return f"{label}That value counts — it is one correct solution. Is there another value that could also work? Your equation is still {eq}."
    if situation in ("conceptual-question", "explanation-request"):
        return (f"{label}Think of the equation as a balance: whatever we do to one side, we do to the other, "
                f"so both sides stay equal. In {eq}, ask what is happening to x and what would undo it. "
                "Live AI explanations will go deeper once connected.")
    if situation == "hint-request":
        return f"{label}Here is one hint: in {eq}, notice what is being done to the part containing x, and think about the operation that undoes it — on both sides."
    if (context["error_category"]) == "division-by-zero":
        return f"{label}Division by zero is not allowed, so that step can't be used. Try a different operation on both sides of {eq}."
    if (context["error_category"]) == "operation-incomplete":
        return f"{label}Say the operation and that it applies to both sides, like “multiply both sides by four”."
    if (context["error_category"]) == "ambiguous-input":
        return f"{label}Give me the whole equation with “equals” in it, or say “x equals …” for a final answer."
    return f"{label}Let's go back to your verified equation, {eq}, and try one small step at a time."


LANGUAGE_RULES = (
    "Equation positions are mandatory when introducing or transforming an equation: explicitly say left hand side and right hand side, naming the expression or value on each. For example, multiply the whole fraction on the left hand side by four, and multiply three on the right hand side by four. Never describe only one side. Use numerator and denominator together with above/below the fraction line or before/after over when explaining fraction layout. Positions supplement mathematical meaning; never rely on sight. "
    "Use familiar words and short sentences throughout. Avoid em dashes, en dashes and dashes used as punctuation. Use full stops or commas instead. "
    "When introducing equations with fractions, say that we will change the equation into a simpler form. Do not call a fraction sharing without first explaining that connection. "
    "Language: write for a Ghana Junior High learner, at about Primary 5 reading level, while keeping the "
    "mathematics exact. Start with the purpose and explain one idea at a time in simple everyday language. Use short spoken sentences and give the learner space to respond. Introduce technical words only when useful, and immediately explain them. "
    "Teach mathematical words instead of avoiding them: when you use a word like numerator, denominator or "
    "equation, say in the same breath what it means. Use everyday examples (food, money, sharing, school) "
    "when they help. Never use developer or academic jargon (no 'verifier', 'solution set', 'extraneous', "
    "'session', 'input'). Never sound babyish or talk down. If the learner asks for easier words, shorten "
    "the sentences and use a familiar example. If the learner says they understand, do not re-explain - "
    "move on. If the learner asks not to be given the answer, guide with questions only. "
    "NONVISUAL TEACHING (core requirement - the learner may not see any screen): every instruction must be "
    "complete by ear alone. Never say watch, look at, see this, as you can see, or refer to highlighting, "
    "pointing, or anything displayed. Name every mathematical part by its name and value and speak the whole "
    "relationship: for example 'the whole of x plus two is the numerator' and 'four is the denominator', and "
    "say what an operation does to BOTH sides and why. Prefer naming the expression itself over calling it "
    "the top or the bottom. For a spoken fraction, identify the number before or after 'over' and explain "
    "what it counts. Never refer to a mathematical part only by a visual position."
)

# Sight-dependent phrasing that must never reach a learner. Model
# output matching this is rejected and replaced by honest fallback.
SIGHT_DEPENDENT_RE = re.compile(
    r"\b(watch (the|this|carefully)|look (at|above|below|here)|see (the|this|above|below)|as you can see|"
    r"highlighted|the highlighted|look inside|watch)\b", re.I)

_SYSTEM = (
    "You are TieSua, a mathematics tutor for blind Junior High learners in Ghana, speaking aloud. "
    "You receive independently verified mathematics plus a situation and an instructional objective. "
    "Follow the objective exactly. Never contradict the verdict, never declare an incorrect step correct, "
    "never invent an equation state, and never suggest an operation listed under "
    "already_successfully_proposed as if it were new. Do not reveal a resulting equation or final answer "
    "unless the situation is solved. Use short, natural spoken English a 12-15 year old understands: "
    "at most 3 short sentences, one idea at a time. Do not open with stock praise such as 'Good work', "
    "'Great job', 'Well done' or 'Thanks for sharing your work'. Avoid visual words like 'look' or 'see'. "
    + LANGUAGE_RULES
)

_LESSON_SYSTEM = (
    "You are TieSua, a mathematics tutor for blind Junior High learners in Ghana, speaking aloud. "
    "Answer the learner's question using ONLY the lesson explanation supplied below - it is checked "
    "teaching content. Do not invent new equations, numbers or rules beyond it. If the question goes "
    "beyond the supplied explanation, say plainly that we have not covered that part yet and offer to "
    "repeat the part we did cover. At most 3 short sentences, ending by inviting the learner to continue. "
    + LANGUAGE_RULES
)


def _extract_content(payload: dict) -> str | None:
    """Extract assistant text from a Chat Completions payload.
    Handles string content and content-part lists; a missing/None
    content (e.g. a reasoning model that spent its token budget
    before answering) yields None, never the literal text 'None'."""
    try:
        content = payload["choices"][0]["message"].get("content")
    except (KeyError, IndexError, TypeError, AttributeError):
        return None
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = [str(p.get("text", "")) for p in content if isinstance(p, dict)]
        joined = "".join(parts).strip()
        return joined or None
    return None


def _validate_model_text(text: str, context: dict, session: Session) -> str | None:
    cleaned = re.sub(r"\s+", " ", text).strip()
    if not cleaned or cleaned.lower() == "none" or len(cleaned) > 700:
        return None
    if SIGHT_DEPENDENT_RE.search(cleaned):
        return None  # sight-dependent teaching must never be spoken
    if re.match(r"(?i)^(good work|great job|well done|thanks for sharing|excellent|brilliant)\b", cleaned):
        return None
    if context.get("verdict") == "invalid" and re.search(r"\b(that'?s|is|was)\s+(right|correct)\b", cleaned, re.I):
        return None
    if not session.solved and re.search(r"\byou have solved\b|\bthe answer is x\s*=", cleaned, re.I):
        return None
    situation = context.get("situation")
    if situation == "operation-proposed-not-completed" and re.search(
            r"what\s+(operation|step|can we|would you)[^?]*\b(undo|remove|inverse|get rid)\b|what can undo", cleaned, re.I):
        return None  # repeats the choice the learner already made
    if situation in ("incorrect-result-after-valid-operation", "hint-request", "operation-proposed-not-completed"):
        expected = context.get("_expected_equation")
        if expected:
            expected_rhs = expected.rsplit("=", 1)[-1].strip()
            if expected_rhs and re.search(rf"(equals|=)\s*{re.escape(expected_rhs)}\b", cleaned):
                return None  # gives away the withheld result
            if cleaned.lower().count(expected.lower()) > 0:
                return None
    return cleaned


def tutor_guidance(session: Session, question: str | None = None) -> dict:
    context = build_context(session, question)
    last_verdict = context["verdict"]
    api_key = os.environ.get("MODEL_API_KEY") or os.environ.get("META_API_KEY")
    model = os.environ.get("META_MODEL") or os.environ.get("MODEL_NAME") or "muse-spark-1.3-contributor"
    base = os.environ.get("META_API_BASE", "https://api.meta.ai/v1").rstrip("/")

    if os.environ.get("TIESUA_TUTOR_MOCK") == "1":
        diag = {"source": "mock", "model": None, "latency_ms": 0, "verdict": last_verdict, "situation": context["situation"]}
        DIAGNOSTICS.append(diag)
        return {"source": "mock", "model": None,
                "text": "Mock tutor (test only, not live AI): " + _fallback_text(session, context).replace("Scripted guidance (not live AI): ", ""),
                "diagnostics": diag}

    if not api_key:
        diag = {"source": "fallback-scripted", "model": None, "latency_ms": 0, "verdict": last_verdict, "situation": context["situation"]}
        DIAGNOSTICS.append(diag)
        return {"source": "fallback-scripted", "model": None, "text": _fallback_text(session, context), "diagnostics": diag}

    max_tokens = int(os.environ.get("META_MAX_TOKENS", "800"))
    if not BUDGET.reserve(max_tokens):
        diag = {"source": "fallback-scripted", "model": model, "latency_ms": 0, "verdict": last_verdict, "situation": context["situation"], "note": "meta budget exhausted"}
        DIAGNOSTICS.append(diag)
        text = _fallback_text(session, context).replace(
            "Scripted guidance (not live AI): ",
            "Scripted guidance (not live AI — the live tutor budget is used up for now): ", 1)
        return {"source": "fallback-scripted", "model": model, "text": text, "diagnostics": diag}

    started = time.perf_counter()
    try:
        response = httpx.post(
            f"{base}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": model,
                  # Muse Spark is a reasoning model: minimal reasoning
                  # plus a realistic cap keeps tutoring answered/cheap.
                  "max_tokens": max_tokens,
                  "reasoning_effort": os.environ.get("META_REASONING_EFFORT", "minimal"),
                  "temperature": 0.3,
                  "messages": [{"role": "system", "content": _SYSTEM},
                               {"role": "user", "content": f"Verified context (JSON): {json.dumps(_public_context(context))}. Give the next tutoring message."}]},
            timeout=20.0,
        )
        response.raise_for_status()
        raw = _extract_content(_record_usage(response.json()))
        latency = round((time.perf_counter() - started) * 1000)
        if raw is None:
            diag = {"source": "fallback-scripted", "model": model, "latency_ms": latency, "verdict": last_verdict, "situation": context["situation"], "note": "empty model content"}
            DIAGNOSTICS.append(diag)
            return {"source": "fallback-scripted", "model": model, "text": _fallback_text(session, context), "diagnostics": diag}
        validated = _validate_model_text(str(raw), context, session)
        if validated is None:
            diag = {"source": "fallback-scripted", "model": model, "latency_ms": latency, "verdict": last_verdict, "situation": context["situation"], "note": "model output failed validation"}
            DIAGNOSTICS.append(diag)
            return {"source": "fallback-scripted", "model": model, "text": _fallback_text(session, context), "diagnostics": diag}
        diag = {"source": "live-meta", "model": model, "latency_ms": latency, "verdict": last_verdict, "situation": context["situation"]}
        DIAGNOSTICS.append(diag)
        return {"source": "live-meta", "model": model, "text": validated, "diagnostics": diag}
    except Exception as exc:  # network, auth, malformed response — honest fallback
        # A failed request may have reached the provider; keep its reservation.
        latency = round((time.perf_counter() - started) * 1000)
        diag = {"source": "fallback-scripted", "model": model, "latency_ms": latency, "verdict": last_verdict, "situation": context["situation"], "note": type(exc).__name__}
        DIAGNOSTICS.append(diag)
        return {"source": "fallback-scripted", "model": model, "text": _fallback_text(session, context), "diagnostics": diag}


def _lesson_fallback(explanation: str) -> str:
    return ("Scripted guidance (not live AI): " + explanation.strip()[:600])


def lesson_guidance(lesson_title: str, example: str, explanation: str, question: str) -> dict:
    """Conceptual questions for lessons without an equation session
    (e.g. fractions). Grounded strictly in the lesson's own checked
    explanation: the model may rephrase and simplify it, never add
    new mathematics. Fallback replays the checked explanation,
    honestly labelled as scripted."""
    api_key = os.environ.get("MODEL_API_KEY") or os.environ.get("META_API_KEY")
    model = os.environ.get("META_MODEL") or os.environ.get("MODEL_NAME") or "muse-spark-1.3-contributor"
    base = os.environ.get("META_API_BASE", "https://api.meta.ai/v1").rstrip("/")
    if os.environ.get("TIESUA_TUTOR_MOCK") == "1":
        diag = {"source": "mock", "model": None, "latency_ms": 0, "situation": "lesson-question"}
        DIAGNOSTICS.append(diag)
        return {"source": "mock", "model": None, "text": "Mock tutor (test only, not live AI): " + explanation.strip()[:300], "diagnostics": diag}
    if not api_key:
        diag = {"source": "fallback-scripted", "model": None, "latency_ms": 0, "situation": "lesson-question"}
        DIAGNOSTICS.append(diag)
        return {"source": "fallback-scripted", "model": None, "text": _lesson_fallback(explanation), "diagnostics": diag}
    max_tokens = int(os.environ.get("META_MAX_TOKENS", "800"))
    if not BUDGET.reserve(max_tokens):
        diag = {"source": "fallback-scripted", "model": model, "latency_ms": 0, "situation": "lesson-question", "note": "meta budget exhausted"}
        DIAGNOSTICS.append(diag)
        return {"source": "fallback-scripted", "model": model, "text": _lesson_fallback(explanation), "diagnostics": diag}
    started = time.perf_counter()
    try:
        response = httpx.post(
            f"{base}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": model, "max_tokens": max_tokens,
                  "reasoning_effort": os.environ.get("META_REASONING_EFFORT", "minimal"),
                  "temperature": 0.3,
                  "messages": [{"role": "system", "content": _LESSON_SYSTEM},
                               {"role": "user", "content": (
                                   f"Lesson: {lesson_title[:120]}\nExample: {example[:120]}\n"
                                   f"Checked explanation: {explanation[:1500]}\nLearner asks: {question[:300]}")}]},
            timeout=20.0,
        )
        response.raise_for_status()
        raw = _extract_content(_record_usage(response.json()))
        latency = round((time.perf_counter() - started) * 1000)
        cleaned = re.sub(r"\s+", " ", str(raw)).strip() if raw else ""
        if not cleaned or cleaned.lower() == "none" or len(cleaned) > 700 or SIGHT_DEPENDENT_RE.search(cleaned) or re.search(r"\b(verifier|solution set|extraneous|session)\b", cleaned, re.I):
            diag = {"source": "fallback-scripted", "model": model, "latency_ms": latency, "situation": "lesson-question", "note": "lesson output failed validation"}
            DIAGNOSTICS.append(diag)
            return {"source": "fallback-scripted", "model": model, "text": _lesson_fallback(explanation), "diagnostics": diag}
        diag = {"source": "live-meta", "model": model, "latency_ms": latency, "situation": "lesson-question"}
        DIAGNOSTICS.append(diag)
        return {"source": "live-meta", "model": model, "text": cleaned, "diagnostics": diag}
    except Exception as exc:
        # A failed request may have reached the provider; keep its reservation.
        latency = round((time.perf_counter() - started) * 1000)
        diag = {"source": "fallback-scripted", "model": model, "latency_ms": latency, "situation": "lesson-question", "note": type(exc).__name__}
        DIAGNOSTICS.append(diag)
        return {"source": "fallback-scripted", "model": model, "text": _lesson_fallback(explanation), "diagnostics": diag}


def _record_usage(payload):
    from .usage import record
    record(payload)
    return payload
