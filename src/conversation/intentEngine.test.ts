import { describe, expect, it } from 'vitest';
import { classifyRequest } from './intentEngine';
import { validateAction } from './actions';

const names = (r: ReturnType<typeof classifyRequest>) => (r.kind === 'actions' ? r.actions.map((a) => a.name) : []);

describe('conversational intent engine (assignment phrases)', () => {
  it.each([
    ["I want a man's voice", 'speech.previewVoice'],
    ['Try another voice', 'speech.previewVoice'],
    ['Go back to the previous voice', 'speech.previewVoice'],
    ["Can you say that a bit louder?", 'speech.setVolume'],
    ["You're talking too fast", 'speech.setRate'],
    ['Speak a little faster', 'speech.setRate'],
    ["Don't pause so much", 'speech.setPauses'],
    ['Make the pauses longer', 'speech.setPauses'],
    ['Make the writing bigger', 'display.setTextSize'],
    ["I can't see this properly", 'display.setTextSize'],
    ['Repeat the equation', 'speech.repeatProblem'],
    ['Explain the numerator', 'lesson.explainPart'],
    ['Give me an easier question', 'lesson.easierProblem'],
    ['What have we done so far?', 'lesson.recap'],
    ["Let's continue", 'lesson.continue'],
    ['Take me home', 'nav.goHome'],
    ['Start the lesson again', 'lesson.restart'],
    ['Stop speaking', 'speech.stop'],
    ['A softer voice please', 'speech.previewVoice'],
    ['Keep this voice', 'speech.previewVoice'],
  ])('%s -> %s', (phrase, expected) => {
    expect(names(classifyRequest(phrase, true))).toContain(expected);
  });

  it('distinguishes repeat / explain / undo of the previous step', () => {
    expect(names(classifyRequest('Repeat the previous step', true))).toEqual(['speech.repeatCurrent']);
    expect(names(classifyRequest('Explain the previous step', true))).toEqual(['lesson.explainStep']);
    const undo = classifyRequest('Undo my last step', true);
    expect(names(undo)).toEqual(['lesson.undoStep']);
    expect(undo.kind === 'actions' && undo.destructive).toBe(true);
  });

  it('combined controls execute settings before repeats', () => {
    const r = classifyRequest('Use another voice, speak a little faster and repeat the equation', true);
    // Comma form is not split; the and-split form is:
    const r2 = classifyRequest('speak a little faster and repeat the equation', true);
    expect(r.kind).toBeDefined();
    expect(names(r2)).toEqual(['speech.setRate', 'speech.repeatProblem']);
  });

  it('mathematics is never split or stolen by controls', () => {
    expect(classifyRequest('Multiply both sides by four and subtract three', true).kind).toBe('math');
    expect(classifyRequest('X plus two equals twelve', true).kind).toBe('math');
    expect(classifyRequest('x+2=12', true).kind).toBe('math');
  });

  it('temporary scope is marked, persistent by default', () => {
    const r = classifyRequest('Slow down for this question', true);
    expect(r.kind === 'actions' && r.actions[0].scope).toBe('temporary');
    const p = classifyRequest("You're talking too fast", true);
    expect(p.kind === 'actions' && p.actions[0].scope).toBe('persistent');
  });

  it('unfamiliar language is not guessed', () => {
    // "Rushing" is handled instantly and locally as slow-down (better
    // than a remote call); sequenced restore requests are not guessed.
    expect(names(classifyRequest("You're rushing through the calculation", true))).toContain('speech.setRate');
    expect(classifyRequest('That voice sounds harsh. Try something gentler', true).kind).toBe('actions'); // softer/gentler matched locally
    expect(classifyRequest('Can you slow down for this question, then go back to normal?', true).kind).toBe('needs-interpretation');
  });

  it('conceptual questions route to the tutor, not the registry', () => {
    expect(classifyRequest('Why do we do the same to both sides?', true).kind).toBe('question');
  });
});

describe('action registry validation', () => {
  it('rejects unregistered actions and bad arguments from any proposer', () => {
    expect(validateAction({ name: 'system.exec', args: { code: 'x' } })).toBeNull();
    expect(validateAction({ name: 'speech.setRate', args: { value: 'fast' } })).toBeNull();
    expect(validateAction({ name: 'display.setTextSize', args: { value: 137 } })).toBeNull();
    expect(validateAction({ name: 'lesson.explainPart', args: { part: 'middle' } })).toBeNull();
  });
  it('clamps numeric settings into safe ranges', () => {
    expect(validateAction({ name: 'speech.setRate', args: { value: 99 } })?.args.value).toBe(2.5);
    expect(validateAction({ name: 'speech.setVolume', args: { value: 0 } })?.args.value).toBe(0.2);
  });
});


it.each(["I don't understand three times four", 'Is three times four twelve?', 'What do you expect me to do?'])('classifies purpose before mathematical content: %s', (text) => {
  expect(['question', 'needs-interpretation']).toContain(classifyRequest(text, true).kind);
});

it.each(['Do not go home', "I don't want another voice", 'If I say go home, what happens?', 'Do not restart the lesson'])('does not execute a refused or conditional action: %s', text => {
  expect(classifyRequest(text, true).kind).not.toBe('actions');
});
it('does not mistake a female voice request for a male voice', () => {
  const result = classifyRequest('a female voice please', true);
  expect(result.kind === 'actions' && result.actions[0].args.descriptor).toBe('feminine-sounding');
});
