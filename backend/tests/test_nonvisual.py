"""Nonvisual teaching enforcement: sight-dependent model output is
rejected before it can be spoken. Uses recorded-style sample
responses only - no live calls."""
from backend.app.orchestrator import _validate_plan
from backend.app.tutor import SIGHT_DEPENDENT_RE

SIGHT_SAMPLES = [
    "Watch the top part: x plus two travels together, all over four.",
    "Look at the numerator and tell me what you see.",
    "As you can see, the highlighted part moves over here.",
    "Watch carefully as we look above the fraction bar.",
]

NONVISUAL_SAMPLES = [
    "The whole of x plus two is the numerator. Four is the denominator, and it divides the whole numerator.",
    "Multiplying both sides by four undoes the division, because four divided by four makes one.",
    "The top number counts the parts we take; the bottom number counts the equal parts in the whole.",
]


def test_sight_regex_catches_samples():
    for sample in SIGHT_SAMPLES:
        assert SIGHT_DEPENDENT_RE.search(sample), sample
    for sample in NONVISUAL_SAMPLES:
        assert not SIGHT_DEPENDENT_RE.search(sample), sample


def test_orchestrator_rejects_sight_dependent_reply():
    for sample in SIGHT_SAMPLES:
        plan = _validate_plan({"actions": [], "teachingMove": "none", "confidence": 0.9, "reply": sample})
        assert plan is None, sample


def test_orchestrator_accepts_nonvisual_teaching():
    for sample in NONVISUAL_SAMPLES:
        plan = _validate_plan({"actions": [], "teachingMove": "none", "confidence": 0.9, "reply": sample})
        assert plan is not None and plan["reply"] == sample, sample
