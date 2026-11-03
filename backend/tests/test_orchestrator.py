"""Central orchestrator: mocked plans, validation, safety rails.
No genuine Meta calls are made in these tests."""
import pytest

from backend.app.orchestrator import TEACHING_MOVES, _guard_tutorial_controls, _validate_plan, orchestrate_request


@pytest.mark.parametrize("purpose", ["request", "question", "answer", "unclear", "stop"])
def test_plan_preserves_classified_learner_purpose(purpose):
    result = _validate_plan({"actions": [], "confidence": 0.95,
                             "teachingMove": "none", "learnerPurpose": purpose})
    assert result["learnerPurpose"] == purpose


def test_plan_does_not_trust_unknown_learner_purpose():
    result = _validate_plan({"actions": [], "confidence": 0.95,
                             "teachingMove": "none", "learnerPurpose": "anything-goes"})
    assert result["learnerPurpose"] is None


def test_tutorial_guard_corrects_invented_keyboard_shortcuts_and_keeps_the_step():
    plan = {"actions": [{"name": "help.guide", "args": {}}], "reply": "Hold the space bar to speak and press the right arrow to move on.", "continuation": "await-response"}
    result = _guard_tutorial_controls(plan, {"tutorial": {"active": True}})
    assert result["actions"] == []
    assert "keyboard button" in result["reply"]
    assert "space bar" not in result["reply"]
    assert result["continuation"] == "await-response"


def test_tutorial_guard_corrects_invented_listening_cue_meaning():
    plan = {"actions": [], "reply": "The higher sound tells you something went well or you moved up a step.", "continuation": "await-response"}
    result = _guard_tutorial_controls(plan, {"tutorial": {"active": True}})
    assert "higher sound means I have started listening" in result["reply"]
    assert "lower sound means listening has ended" in result["reply"]
    assert _guard_tutorial_controls(plan, {}) == plan


def test_tutorial_guard_applies_to_model_response(monkeypatch):
    import json
    import backend.app.orchestrator as module
    monkeypatch.delenv("TIESUA_TUTOR_MOCK", raising=False)
    monkeypatch.setenv("MODEL_API_KEY", "test-key")
    monkeypatch.setattr(module.BUDGET, "reserve", lambda _tokens: True)
    class Response:
        def raise_for_status(self): pass
        def json(self):
            return {"choices": [{"message": {"content": json.dumps({
                "actions": [{"name": "help.guide", "args": {}}], "confidence": 0.9,
                "teachingMove": "none", "reply": "Hold the space bar to speak.",
                "continuation": "await-response"})}}]}
    monkeypatch.setattr(module.httpx, "post", lambda *args, **kwargs: Response())
    result = orchestrate_request("How do I use the keyboard?", {"tutorial": {"active": True, "stage": "controls"}})
    assert result["actions"] == []
    assert "keyboard button" in result["reply"]


@pytest.fixture(autouse=True)
def mock_mode(monkeypatch):
    monkeypatch.setenv("TIESUA_TUTOR_MOCK", "1")


def test_mock_combined_plan_slow_plus_fractions():
    r = orchestrate_request("explain everything slowly and learn fractions", {"screen": "home"})
    assert r["source"] == "mock"
    names = [a["name"] for a in r["actions"]]
    assert "speech.setRate" in names and "lesson.openLesson" in names
    # Settings change is ordered before navigation.
    assert names.index("speech.setRate") < names.index("lesson.openLesson")


def test_mock_teaching_moves():
    assert orchestrate_request("I still don't understand", {})["teachingMove"] == "explain-differently"
    assert orchestrate_request("Give me a chance to try myself", {})["teachingMove"] == "independent-practice"
    assert orchestrate_request("Can we do another example?", {})["teachingMove"] == "guided-example"


def test_validate_rejects_unknown_action_and_move():
    assert _validate_plan({"actions": [{"name": "os.exec", "args": {}}], "teachingMove": "none", "confidence": 0.9}) is None
    assert _validate_plan({"actions": [], "teachingMove": "skip-to-end", "confidence": 0.9}) is None
    assert _validate_plan({"actions": [], "teachingMove": "complete-the-lesson", "confidence": 1}) is None


def test_validate_rejects_jargon_reply_and_bad_args():
    assert _validate_plan({"actions": [], "teachingMove": "none", "confidence": 0.9,
                           "reply": "the verifier session says so"}) is None
    assert _validate_plan({"actions": [{"name": "display.setTextSize", "args": {"value": 175}}],
                           "teachingMove": "none", "confidence": 0.9}) is None


def test_every_teaching_move_is_non_destructive_by_design():
    # No move can complete a lesson or judge mathematics.
    for move in TEACHING_MOVES:
        assert "complete" not in move and "correct" not in move and "verdict" not in move


def test_turn_contract_continuation_is_always_present():
    # A bare explanation with no declared continuation must be
    # derived as teach-next, never left as a dead end.
    plan = _validate_plan({"actions": [], "teachingMove": "none", "confidence": 0.9,
                           "reply": "Multiplying both sides by four keeps the equation balanced."})
    assert plan["continuation"] == "teach-next"
    # A question awaits the learner.
    plan = _validate_plan({"actions": [], "teachingMove": "none", "confidence": 0.9,
                           "reply": "Now we have x plus two equals twelve. What should we do next to find x?"})
    assert plan["continuation"] == "await-response"
    # A question-bearing move awaits the learner.
    plan = _validate_plan({"actions": [], "teachingMove": "guided-example", "confidence": 0.9, "reply": "Let us try one together."})
    assert plan["continuation"] == "await-response"
    # Closing requires a confident interpretation of a stopping request.
    plan = _validate_plan({"actions": [], "teachingMove": "none", "confidence": 0.9, "reply": "Well done today.", "continuation": "close"})
    assert plan["continuation"] == "await-response"
    plan = _validate_plan({"actions": [], "teachingMove": "none", "confidence": 0.95, "learnerPurpose": "stop", "reply": "We can stop here.", "continuation": "close"})
    assert plan["continuation"] == "close"


def test_unclear_speech_cannot_end_conversation():
    plan = _validate_plan({"actions": [{"name": "conversation.end", "args": {}}],
                           "teachingMove": "none", "confidence": 0.95,
                           "learnerPurpose": "unclear", "reply": "Goodbye.", "continuation": "close"})
    assert plan["actions"] == []
    assert plan["continuation"] == "await-response"
    assert plan["clarification"]


def test_prerequisite_move_is_registered_and_validated():
    plan = _validate_plan({"actions": [], "teachingMove": "explain-prerequisite", "confidence": 0.9, "reply": "Let us think about groups of oranges first."})
    assert plan is not None and plan["teachingMove"] == "explain-prerequisite"
    assert _validate_plan({"actions": [], "teachingMove": "teach-anything", "confidence": 0.9}) is None


def test_mock_is_labelled_and_never_claims_live():
    r = orchestrate_request("hello", {})
    assert r["source"] == "mock" and r["model"] is None
    assert "not live AI" in r["reply"]
def test_full_available_action_list_reaches_model_context():
    import json
    from backend.app.orchestrator import _context_for_model
    actions = [f'action.{i}' for i in range(25)]
    context = json.loads(_context_for_model({'screen': 'lesson', 'available_actions': actions}))
    assert context['available_actions'] == actions


def test_tutorial_state_and_available_actions_reach_model_request():
    import json
    from backend.app.orchestrator import _context_for_model
    ctx = {'screen': 'home', 'tutorial': {'active': True, 'stage': 'repeat', 'sample': 'Two over four means two of four equal parts.'},
           'available_actions': ['speech.repeatCurrent', 'help.tutorialNext', 'help.tutorialExit'],
           'lesson_content': 'long ' * 2000}
    result = json.loads(_context_for_model(ctx))
    assert result['tutorial'] == ctx['tutorial']
    assert result['available_actions'] == ctx['available_actions']

def test_resume_option_execution_survives_actual_context_serialization():
    import json
    from backend.app.orchestrator import _context_for_model
    option = {"id": "resume", "title": "continue the current lesson",
              "action": {"name": "lesson.openLesson", "args": {"query": "equations-fraction"}}}
    result = json.loads(_context_for_model({"screen": "home", "pending_options": [option]}))
    assert result["pending_options"][0] == option

def test_opening_brief_reaches_model_context():
    import json
    from backend.app.orchestrator import _context_for_model
    brief = "Find a missing number. Start with a sweets story, then connect it to the equation."
    result = json.loads(_context_for_model({"screen": "lesson", "opening": "new", "opening_brief": brief}))
    assert result["opening_brief"] == brief

def test_transport_failure_is_service_unavailable_not_unclear_learner(monkeypatch):
    from backend.app import orchestrator
    import httpx
    monkeypatch.delenv("TIESUA_TUTOR_MOCK", raising=False)
    monkeypatch.setenv("MODEL_API_KEY", "offline-placeholder")
    monkeypatch.setattr(orchestrator.BUDGET, "reserve", lambda amount: True)
    def fail(*args, **kwargs):
        raise httpx.ReadTimeout("offline simulated timeout")
    monkeypatch.setattr(orchestrator.httpx, "post", fail)
    result = orchestrator.orchestrate_request("two sweets were added", {"screen": "lesson"})
    assert result["source"] == "unavailable"
    assert result["diagnostics"]["note"] == "ReadTimeout"
    assert result["actions"] == []
