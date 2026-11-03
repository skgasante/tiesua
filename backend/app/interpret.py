"""Meta-powered interpretation of unfamiliar learner language.

The model proposes actions from the safe registry below; every
proposal is validated here (name + argument shapes + ranges) and
again client-side before anything executes. The model can never
mutate state, emit code, or bypass the mathematical verifier.
When interpretation is unavailable, over-budget, low-confidence or
invalid, the result asks for clarification instead of guessing.
"""
from __future__ import annotations

import json
import os
import re
import time

import httpx

from .tutor import BUDGET, DIAGNOSTICS, _extract_content

REGISTRY = {
    "speech.setRate", "speech.setPauses", "speech.setVolume",
    "speech.previewVoice", "speech.repeatProblem", "speech.repeatCurrent",
    "demo.hearOrdinary", "demo.hearClear", "speech.stop", "conversation.end", "conversation.wait", "confirmation.accept", "confirmation.decline", "help.guide", "help.offerLessons", "help.tutorialNext", "help.tutorialExit", "lesson.explainPart", "lesson.hint", "lesson.explainStep",
    "lesson.recap", "lesson.easierProblem", "lesson.nextProblem",
    "lesson.reviewPrevious", "lesson.reviewNext", "lesson.returnCurrent", "lesson.restart", "lesson.undoStep", "lesson.continue", "lesson.repeatLesson",
    "lesson.nextLesson", "lesson.morePractice", "lesson.openLesson", "nav.goHome",
    "nav.openHear", "nav.openLearn", "nav.openLessons", "nav.openSettings",
    "display.setTextSize", "reading.temporaryStyle",
}

_SYSTEM = (
    "You translate a learner's words into application actions for TieSua, a maths tutor for blind learners. "
    "Reply with ONLY a JSON object: {\"actions\": [{\"name\": ..., \"args\": {...}, \"scope\": \"persistent|temporary\"}], "
    "\"confidence\": 0.0-1.0, \"clarification\": null or a short question}. Allowed action names: "
    + ", ".join(sorted(REGISTRY)) +
    ". speech.setRate/setPauses/setVolume take args {delta: number} or {value: number}. "
    "speech.previewVoice takes {direction: descriptor|next|previous|keep, descriptor?: string}. "
    "lesson.explainPart takes {part: numerator|denominator|left|right|whole}. "
    "display.setTextSize takes {value: 100|125|150|200}. reading.temporaryStyle takes {style: slow|detailed|slow-detailed} with scope temporary. "
    "Use scope temporary when the learner says 'for this question/problem' or 'then go back to normal' (for the second part, also propose restoring the persistent value if clear). "
    "Lesson flow: 'do it again / teach me again' -> lesson.repeatLesson; 'what is next / move on' -> lesson.nextLesson; "
    "'another example together / guide me / I need your help with one more' -> lesson.morePractice {mode: guided}; 'let me try myself / give it a shot' -> lesson.morePractice {mode: independent}; "
    "'teach me X / I want to learn X' -> lesson.openLesson {query: X} (never invent lesson ids). "
    "The context may include available_lessons, the current stage and TieSua's last_question - use them: a short answer like "
    "'with your help' after a together-or-yourself question means lesson.morePractice guided, and 'let me try' means independent. "
    "CRITICAL: respect negation. If the learner says they do NOT want a topic, or already know it, NEVER propose opening it; "
    "if they contrast it with another topic ('I know fractions, let's do equations'), propose the wanted one only. "
    "If the request is really unclear, return no actions and a short, natural clarification question - never ask the learner to repeat an exact phrase. "
    "Never invent actions, never output code, never decide mathematics. If unsure, return empty actions, low confidence and a clarification question."
)


def _validate(raw: object) -> dict | None:
    if not isinstance(raw, dict):
        return None
    actions = raw.get("actions")
    if not isinstance(actions, list) or len(actions) > 4:
        return None
    cleaned = []
    for item in actions:
        if not isinstance(item, dict) or item.get("name") not in REGISTRY:
            return None
        args = item.get("args") if isinstance(item.get("args"), dict) else {}
        # Argument allowlist per action (shapes only; client re-checks ranges).
        allowed = {
            "speech.setRate": {"value", "delta"}, "speech.setPauses": {"value", "delta"},
            "speech.setVolume": {"value", "delta"}, "speech.previewVoice": {"direction", "descriptor"},
            "lesson.explainPart": {"part"}, "display.setTextSize": {"value"},
            "reading.temporaryStyle": {"style"}, "lesson.morePractice": {"mode"},
            "lesson.openLesson": {"query"},
        }.get(item["name"], set())
        if not set(args.keys()) <= allowed:
            return None
        if item["name"] == "display.setTextSize" and args.get("value") not in (100, 125, 150, 200):
            return None
        if item["name"] == "speech.previewVoice" and args.get("direction") not in ("descriptor", "next", "previous", "keep"):
            return None
        if item["name"] == "lesson.explainPart" and args.get("part") not in ("numerator", "denominator", "left", "right", "whole"):
            return None
        if item["name"] == "lesson.morePractice" and args.get("mode") not in ("guided", "independent"):
            return None
        if item["name"] == "lesson.openLesson" and not (isinstance(args.get("query"), str) and 0 < len(args["query"]) <= 60):
            return None
        cleaned.append({"name": item["name"], "args": args,
                        "scope": "temporary" if item.get("scope") == "temporary" else "persistent"})
    try:
        confidence = float(raw.get("confidence", 0))
    except (TypeError, ValueError):
        return None
    clarification = raw.get("clarification")
    return {"actions": cleaned, "confidence": confidence,
            "clarification": str(clarification)[:200] if clarification else None}


def interpret_request(text: str, context: dict | None = None) -> dict:
    api_key = os.environ.get("MODEL_API_KEY") or os.environ.get("META_API_KEY")
    model = os.environ.get("META_MODEL") or os.environ.get("MODEL_NAME") or "muse-spark-1.3-contributor"
    base = os.environ.get("META_API_BASE", "https://api.meta.ai/v1").rstrip("/")
    clarify = {"source": "clarification", "actions": [],
               "clarification": "I want to get that right. Did you mean to change how I speak, or is that about the mathematics?"}

    if os.environ.get("TIESUA_TUTOR_MOCK") == "1":
        return {"source": "mock", "actions": [], "clarification": "Mock interpreter (test only).", "diagnostics": {"source": "mock", "model": None}}
    if not api_key:
        return {**clarify, "source": "unavailable"}

    # Reasoning model: a small cap can be spent before any JSON is
    # produced (same lesson as the tutor's 800-token floor).
    max_tokens = int(os.environ.get("META_INTERPRET_MAX_TOKENS", "800"))
    if not BUDGET.reserve(max_tokens):
        return {**clarify, "source": "unavailable", "clarification": "Live help with wording is paused just now. You can use the Talk button options, or type your step."}

    started = time.perf_counter()
    try:
        response = httpx.post(
            f"{base}/chat/completions",
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json={"model": model, "max_tokens": max_tokens,
                  "reasoning_effort": os.environ.get("META_REASONING_EFFORT", "minimal"),
                  "temperature": 0.1,
                  "messages": [{"role": "system", "content": _SYSTEM},
                               {"role": "user", "content": f"Context: {json.dumps(context or {})[:600]}\nLearner said: {text[:300]}"}]},
            timeout=15.0,
        )
        response.raise_for_status()
        raw_text = _extract_content(_record_usage(response.json()))
        latency = round((time.perf_counter() - started) * 1000)
        if raw_text is None:
            raise ValueError("empty model content")
        # Tolerate code fences and any prose around the JSON object.
        cleaned_json = re.sub(r"^```(?:json)?|```$", "", raw_text.strip(), flags=re.M).strip()
        start, end = cleaned_json.find("{"), cleaned_json.rfind("}")
        if start >= 0 and end > start:
            cleaned_json = cleaned_json[start:end + 1]
        parsed = _validate(json.loads(cleaned_json))
        if parsed is None or parsed["confidence"] < 0.6 or not parsed["actions"]:
            diag = {"source": "clarification", "model": model, "latency_ms": latency, "note": "interpretation not confident"}
            DIAGNOSTICS.append(diag)
            return {**clarify, "diagnostics": diag,
                    "clarification": parsed["clarification"] if parsed and parsed["clarification"] else clarify["clarification"]}
        diag = {"source": "live-meta", "model": model, "latency_ms": latency, "note": "interpretation"}
        DIAGNOSTICS.append(diag)
        return {"source": "live-meta", "model": model, "actions": parsed["actions"],
                "confidence": parsed["confidence"], "clarification": None, "diagnostics": diag}
    except Exception as exc:
        # A failed request may have reached the provider; keep its reservation.
        latency = round((time.perf_counter() - started) * 1000)
        diag = {"source": "clarification", "model": model, "latency_ms": latency, "note": type(exc).__name__}
        DIAGNOSTICS.append(diag)
        return {**clarify, "diagnostics": diag}


def _record_usage(payload):
    from .usage import record
    record(payload)
    return payload
