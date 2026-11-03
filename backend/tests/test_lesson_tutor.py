"""Grounded lesson-question tutor endpoint (fractions lessons)."""
import pytest
from fastapi.testclient import TestClient

from backend.app.main import app
from backend.app.tutor import LANGUAGE_RULES, _LESSON_SYSTEM, _SYSTEM

client = TestClient(app)


@pytest.fixture(autouse=True)
def _mock_mode(monkeypatch):
    monkeypatch.setenv("TIESUA_TUTOR_MOCK", "1")


def test_language_rules_present_in_both_prompts():
    for phrase in ("Primary 5", "numerator", "do not re-explain", "guide with questions only"):
        assert phrase in _SYSTEM
    assert "ONLY the lesson explanation" in _LESSON_SYSTEM
    assert LANGUAGE_RULES in _LESSON_SYSTEM


def test_lesson_tutor_mock_is_grounded_and_labelled():
    r = client.post("/v1/tutor/lesson", json={
        "lesson_title": "Parts of a Whole",
        "example": "2/4",
        "explanation": "The denominator counts the equal parts in the whole.",
        "question": "I don't understand what a denominator is.",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "mock"
    assert "Mock tutor" in body["text"]
    assert "denominator counts" in body["text"]


def test_lesson_tutor_rejects_oversized_content():
    r = client.post("/v1/tutor/lesson", json={
        "lesson_title": "x", "explanation": "y" * 2000, "question": "why?",
    })
    assert r.status_code == 422
