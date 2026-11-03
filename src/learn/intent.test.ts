import { describe, expect, it } from 'vitest';
import { classifyIntent } from './intent';

describe('learner intent layer', () => {
  it.each([
    ['Repeat the question.', 'repeat-problem'],
    ['Repeat the problem', 'repeat-problem'],
    ['Explain that step.', 'explain-step'],
    ['Give me a hint.', 'hint'],
    ['Speak slower.', 'speak-slower'],
    ['Stop speaking.', 'stop-speaking'],
    ['Repeat that', 'repeat-current'],
    ['Start again', 'restart'],
  ])('classifies %s as %s', (phrase, command) => {
    expect(classifyIntent(phrase)).toEqual({ type: 'command', command });
  });

  it.each([
    'Multiply both sides by four.',
    'X plus two equals twelve.',
    'X equals ten.',
    'multiply both sides by 4',
    'x+2=12',
  ])('leaves mathematical input untouched: %s', (phrase) => {
    expect(classifyIntent(phrase).type).toBe('input');
  });

  it('does not mistake an explanation question containing maths for a command to solve', () => {
    // "Why..." is an explanation request, routed to the tutor, not the verifier.
    expect(classifyIntent('Why do we multiply both sides?')).toEqual({ type: 'command', command: 'explain-step' });
  });
});
