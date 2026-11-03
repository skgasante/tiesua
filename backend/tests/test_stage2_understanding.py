"""Offline state transitions: no model or running backend required."""
from backend.app.verifier import create_session, submit_step, state_payload


def test_help_does_not_grade_or_change_pending_equation():
    _, session = create_session('(x+2)/4=3')
    submit_step(session, 'Multiply by four.')
    before = state_payload(session)
    for text in ["I don't understand three times four", 'Is three times four twelve?', 'What do you expect me to do?']:
        result = submit_step(session, text)
        assert result['action_type'] == 'question'
        assert state_payload(session) == before


def test_natural_verified_solution_sequence():
    _, session = create_session('(x+2)/4=3')
    assert submit_step(session, 'Times both sides by four.')['verdict'] == 'valid'
    assert submit_step(session, 'X plus two equals twelve.')['verdict'] == 'valid'
    before = state_payload(session)
    assert submit_step(session, 'X equals to eleven')['verdict'] == 'invalid'
    assert state_payload(session) == before
    assert submit_step(session, 'Take away two from both sides.')['verdict'] == 'valid'
    assert submit_step(session, 'X equals to ten')['state']['solved'] is True


def test_actual_model_request_retains_verified_context(monkeypatch):
    import json
    from backend.app import orchestrator
    monkeypatch.delenv('TIESUA_TUTOR_MOCK', raising=False)
    monkeypatch.setenv('MODEL_API_KEY', 'offline-placeholder')
    monkeypatch.setattr(orchestrator.BUDGET, 'reserve', lambda amount: True)
    captured = []
    class Response:
        def raise_for_status(self):
            pass
        def json(self):
            return {'choices': [{'message': {'content': json.dumps({'actions': [], 'teachingMove': 'none', 'reply': 'Which step would you like help with?', 'confidence': .9})}}]}
    def fake_post(url, **kwargs):
        captured.append(kwargs['json']['messages'][1]['content'])
        return Response()
    monkeypatch.setattr(orchestrator.httpx, 'post', fake_post)
    ctx = {'lesson_content': 'z' * 9000, 'title': 'z' * 9000,
           'verified_result': {'verdict': 'invalid', 'equation_now': 'x + 2 = 12'},
           'equation': 'x + 2 = 12', 'pending_operation': 'subtract both sides by 2',
           'learner_purpose': 'question-or-help', 'stage': 'independent'}
    orchestrator.orchestrate_request("I don't understand three times four", ctx)
    assert len(captured) == 1
    context_text, utterance = captured[0].removeprefix('Context: ').split('\nLearner said: ')
    actual = json.loads(context_text)
    assert actual['verified_result'] == ctx['verified_result']
    assert actual['pending_operation'] == ctx['pending_operation']
    assert actual['learner_purpose'] == 'question-or-help'
    assert utterance == "I don't understand three times four"
    assert len(context_text) <= 4000


def test_explicit_answer_phrase_is_verified_against_original():
    _, session = create_session('(x+2)/4=3')
    assert submit_step(session, 'The answer is eleven')['verdict'] == 'invalid'
    assert not session.solved
    assert submit_step(session, 'The answer is ten')['state']['solved']


def test_guard_also_blocks_spoken_final_answer_and_wrong_fraction_praise():
    from backend.app.orchestrator import _validate_plan
    raw = {'actions': [], 'teachingMove': 'none', 'reply': 'X equals ten.', 'confidence': .9}
    assert _validate_plan(raw, {'verdict': 'valid', 'equation_now': 'x + 2 = 12'})['reply'] == ''
    raw['reply'] = 'That is correct.'
    assert _validate_plan(raw, {'verdict': 'wrong'})['reply'] == ''


def test_unrelated_equation_with_extra_solutions_never_replaces_problem():
    _, session = create_session('(x+2)/4=3')
    before = state_payload(session)
    result = submit_step(session, '(x-10)*(x-11)=0')
    assert result['verdict'] == 'invalid'
    assert state_payload(session) == before


def test_extra_solutions_must_match_the_pending_operation():
    _, session = create_session('(x+2)/4=3')
    submit_step(session, 'multiply both sides by x')
    before = state_payload(session)
    result = submit_step(session, 'x*(x-10)*(x-11)=0')
    assert result['verdict'] == 'invalid'
    assert state_payload(session) == before


def test_model_false_arithmetic_is_suppressed_without_or_with_verified_state():
    from backend.app.orchestrator import _validate_plan
    raw = {'actions': [], 'teachingMove': 'none', 'reply': 'Three times four makes thirteen.', 'confidence': .9}
    for context in (None, {'verdict': 'invalid', 'equation_now': '(x + 2)/4 = 3'}):
        assert _validate_plan(raw, context)['reply'] == ''
    raw['reply'] = '3 × 4 = 13.'
    assert _validate_plan(raw, None)['reply'] == ''
    raw['reply'] = 'Three times four makes twelve.'
    assert _validate_plan(raw, {'verdict': 'valid'})['reply'] == raw['reply']

def test_actual_model_request_keeps_same_step_answers(monkeypatch):
    import json
    from backend.app import orchestrator
    monkeypatch.delenv("TIESUA_TUTOR_MOCK", raising=False)
    monkeypatch.setenv("MODEL_API_KEY", "offline-placeholder")
    monkeypatch.setattr(orchestrator.BUDGET, "reserve", lambda amount: True)
    captured = []
    class Response:
        def raise_for_status(self):
            pass
        def json(self):
            return {"choices": [{"message": {"content": json.dumps({
                "actions": [], "teachingMove": "none", "stepAssessment": "correct",
                "reply": "Yes.", "confidence": .95
            })}}]}
    def fake_post(url, **kwargs):
        captured.append(kwargs["json"]["messages"][1]["content"])
        return Response()
    monkeypatch.setattr(orchestrator.httpx, "post", fake_post)
    memory = {"recent_turns": [
        {"learner": "four friends shared and each got three",
         "tutor": "How many sweets did we start with?", "assessment": "partial"}
    ], "answers_without_progress": 1}
    plan = orchestrator.orchestrate_request("12", {
        "screen": "lesson", "stage": "example",
        "step_conversation": memory,
        "current_question": "Can you tell me what happened in your own words?",
        "lesson_content": "long " * 3000,
        "catalogue": "long " * 3000,
    })
    context_text, utterance = captured[0].removeprefix("Context: ").split("\nLearner said: ")
    assert json.loads(context_text)["step_conversation"] == memory
    assert utterance == "12"
    assert plan["stepAssessment"] == "correct"
    assert len(context_text) <= 4000
