import { beforeEach, describe, expect, it } from 'vitest';
import { FRACTIONS_PARTS } from '../lessons/content/fractionsParts';
import { getLesson } from '../lessons/catalogue';
import { clearPendingChoice, getPendingChoice, pendingChoiceContext, resolvePendingAction, setPendingChoice } from './pendingChoice';

describe('shared pending-choice context', () => {
  beforeEach(() => clearPendingChoice());

  it('remembers the spoken options in spoken order, across surfaces', () => {
    const options = [getLesson('equations-fraction')!, FRACTIONS_PARTS];
    setPendingChoice(options, 'Which sounds right?');
    // Spoken order is preserved exactly - never re-sorted to
    // catalogue order, so "the second one" means what was heard.
    expect(pendingChoiceContext().map((o) => o.id)).toEqual(['equations-fraction', 'fractions-parts']);
    expect(getPendingChoice()?.question).toBe('Which sounds right?');
  });

  it('clears when a lesson opens or a new conversation starts', () => {
    setPendingChoice([FRACTIONS_PARTS], 'Which sounds right?');
    clearPendingChoice();
    expect(getPendingChoice()).toBeNull();
    expect(pendingChoiceContext()).toEqual([]);
  });

  it('an empty choice is no choice', () => {
    setPendingChoice([], 'Which sounds right?');
    expect(getPendingChoice()).toBeNull();
  });
});


it('executes the second spoken activity without grading it as a number', () => {
  setPendingChoice([
    { id: 'guided', title: 'together', action: { name: 'lesson.morePractice', args: { mode: 'guided' } } },
    { id: 'independent', title: 'alone', action: { name: 'lesson.morePractice', args: { mode: 'independent' } } },
  ], 'Together, or alone?');
  expect(resolvePendingAction('the second one')).toEqual({ name: 'lesson.morePractice', args: { mode: 'independent' } });
  expect(resolvePendingAction('the second one')).toBeNull();
});
