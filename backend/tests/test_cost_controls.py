"""Cost controls: kill switch and dev ceiling (no live calls made)."""
import pytest

from backend.app.tutor import BUDGET, MetaBudget, lesson_guidance, tutor_guidance
from backend.app.interpret import interpret_request
from backend.app.verifier import create_session


def test_unlimited_override_only_applies_to_contributor_and_keeps_kill_switch(monkeypatch):
    monkeypatch.setenv('TIESUA_UNLIMITED_CALLS', '1')
    monkeypatch.setenv('TIESUA_DEV_MAX_CALLS', '1')
    monkeypatch.setenv('TIESUA_BUDGET_MAX_CALLS', '1')
    monkeypatch.setenv('TIESUA_BUDGET_MAX_TOKENS', '100')
    monkeypatch.setenv('META_MODEL', 'muse-spark-1.3-contributor')
    monkeypatch.delenv('TIESUA_DISABLE_LIVE_AI', raising=False)
    budget = MetaBudget()
    assert budget.reserve(800) and budget.reserve(800)
    monkeypatch.setenv('TIESUA_DISABLE_LIVE_AI', '1')
    assert not budget.reserve(800)
    monkeypatch.delenv('TIESUA_DISABLE_LIVE_AI')
    monkeypatch.setenv('META_MODEL', 'muse-spark-1.3')
    assert not budget.reserve(800)


def test_kill_switch_blocks_reservation(monkeypatch):
    monkeypatch.setenv("TIESUA_DISABLE_LIVE_AI", "1")
    budget = MetaBudget()
    assert budget.reserve(800) is False
    assert budget.status()["live_ai_enabled"] is False


def test_dev_ceiling_blocks_after_cap(monkeypatch):
    monkeypatch.delenv("TIESUA_DISABLE_LIVE_AI", raising=False)
    monkeypatch.setenv("TIESUA_DEV_MAX_CALLS", "1")
    budget = MetaBudget()
    assert budget.reserve(100) is True
    assert budget.reserve(100) is False
    budget.refund()
    assert budget.reserve(100) is True


def test_kill_switch_makes_tutor_honest_fallback(monkeypatch):
    monkeypatch.setenv("TIESUA_DISABLE_LIVE_AI", "1")
    monkeypatch.delenv("TIESUA_TUTOR_MOCK", raising=False)
    before = BUDGET.status()["total_calls_since_start"]
    _sid, session = create_session("(x+2)/4 = 3")
    out = tutor_guidance(session, None)
    assert out["source"] == "fallback-scripted"
    assert BUDGET.status()["total_calls_since_start"] == before


def test_kill_switch_makes_lesson_tutor_honest_fallback(monkeypatch):
    monkeypatch.setenv("TIESUA_DISABLE_LIVE_AI", "1")
    monkeypatch.delenv("TIESUA_TUTOR_MOCK", raising=False)
    out = lesson_guidance("Parts of a Whole", "2/4", "The denominator counts the equal parts.", "What is a denominator?")
    assert out["source"] == "fallback-scripted"
    assert "Scripted guidance (not live AI)" in out["text"]


def test_kill_switch_makes_interpret_unavailable(monkeypatch):
    monkeypatch.setenv("TIESUA_DISABLE_LIVE_AI", "1")
    monkeypatch.delenv("TIESUA_TUTOR_MOCK", raising=False)
    out = interpret_request("quicken your voice a touch", {"screen": "lesson"})
    assert out["source"] == "unavailable"
    assert out["actions"] == []


def test_uncertain_network_failure_does_not_bypass_call_cap(monkeypatch):
    from backend.app import orchestrator
    budget = MetaBudget()
    monkeypatch.setattr(orchestrator, 'BUDGET', budget)
    monkeypatch.setenv('MODEL_API_KEY', 'offline-placeholder')
    monkeypatch.setenv('TIESUA_DEV_MAX_CALLS', '1')
    monkeypatch.delenv('TIESUA_DISABLE_LIVE_AI', raising=False)
    monkeypatch.delenv('TIESUA_TUTOR_MOCK', raising=False)
    attempts = []
    def failed_request(*args, **kwargs):
        attempts.append(1)
        raise TimeoutError('provider may have received request')
    monkeypatch.setattr(orchestrator.httpx, 'post', failed_request)
    orchestrator.orchestrate_request('help', {})
    orchestrator.orchestrate_request('help again', {})
    assert len(attempts) == 1
    assert budget.status()['total_calls_since_start'] == 1
