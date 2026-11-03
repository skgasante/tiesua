"""Varied learner turns against the real verifier, with no model calls."""
import pytest
from backend.app.verifier import create_session, state_payload, submit_step

ARITHMETIC = [
    (f'{a} times {b} makes {answer}', correct)
    for a, b in [(2, 3), (3, 4), (4, 5), (6, 2), (7, 3), (8, 2), (9, 2), (5, 3), (4, 4), (6, 3)]
    for answer, correct in [(a * b, True), (a * b + 1, False)]
]
QUESTIONS = [
    'Why multiply both sides?', 'How do I start?', 'What does x mean?',
    'Can you explain the division?', 'I do not understand three times four',
    "I don't understand the fraction", 'Is three times four twelve?',
    'Is three times four thirteen?', 'What do you expect me to do?',
    'Why does the four disappear?', 'Can I subtract two?', 'How is twelve obtained?',
    'What happens if I multiply one side?', 'Explain that again', 'Give me a hint',
    'I am confused', 'Where did the twelve come from?', 'Should I divide?',
    'Do I have to multiply?', 'Why is the equation balanced?',
    'Why is the denominator three?', 'How do I undo division?',
    'What does all over mean?', 'Can you say the question again?',
    'Should I multiply by zero?', 'Is x equal to ten?',
    'What happens to the left side?', 'How can I check my answer?',
    'Why are there brackets?', 'Could you give me an example?',
    'Is twelve the answer?', 'Why not add four?',
    'What is the numerator?', 'How many groups of four?',
    'Can I take a break?', 'What does multiply mean?',
    'Where am I in this problem?', 'Should both sides change?',
    'Do you mean multiply by four?', 'Why does four times three make twelve?',
]
FALSE_EQUALITIES = [f'{a} equals {a + 1}' for a in range(1, 11)]
TRUE_EQUALITIES = [f'{a} equals {a}' for a in range(1, 11)]

@pytest.mark.parametrize('text,correct', ARITHMETIC)
def test_arithmetic_is_not_an_equation_transformation(text, correct):
    _, session = create_session('(x+2)/4=3')
    submit_step(session, 'multiply by four')
    before = state_payload(session)
    result = submit_step(session, text)
    assert (result['verdict'] == 'valid') is correct
    assert state_payload(session) == before

@pytest.mark.parametrize('text', QUESTIONS)
def test_question_never_changes_pending_work(text):
    _, session = create_session('(x+2)/4=3')
    submit_step(session, 'multiply by four')
    before = state_payload(session)
    result = submit_step(session, text)
    assert result['action_type'] == 'question'
    assert state_payload(session) == before

@pytest.mark.parametrize('text', FALSE_EQUALITIES + TRUE_EQUALITIES)
def test_numeric_equalities_never_replace_the_active_equation(text):
    _, session = create_session('(x+2)/4=3')
    before = state_payload(session)
    submit_step(session, text)
    assert state_payload(session) == before
