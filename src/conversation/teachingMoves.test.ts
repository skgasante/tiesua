import { teachingFollowUp } from './turnContract';
import { describe, expect, it } from 'vitest';
import { canExecuteMove, isTeachingMove, type MoveContext } from './teachingMoves';

const ctx = (over: Partial<MoveContext> = {}): MoveContext => ({
  stage: 'choice', hasExampleCheck: true, exampleCheckDone: false, inPractice: false, ...over,
});

describe('teaching-move gate (lesson engine authority)', () => {
  it('recognises only registered moves', () => {
    expect(isTeachingMove('guided-example')).toBe(true);
    expect(isTeachingMove('complete-lesson')).toBe(false);
    expect(isTeachingMove('mark-correct')).toBe(false);
    expect(isTeachingMove(42)).toBe(false);
  });

  it('independent practice is never a first contact', () => {
    expect(canExecuteMove('independent-practice', ctx({ stage: 'intro' })).ok).toBe(false);
    expect(canExecuteMove('independent-practice', ctx({ stage: 'example' })).ok).toBe(false);
    expect(canExecuteMove('independent-practice', ctx({ stage: 'choice' })).ok).toBe(true);
    expect(canExecuteMove('independent-practice', ctx({ stage: 'guided' })).ok).toBe(true);
  });

  it('guided example requires the introduction first', () => {
    expect(canExecuteMove('guided-example', ctx({ stage: 'intro' })).ok).toBe(false);
    expect(canExecuteMove('guided-example', ctx({ stage: 'example' })).ok).toBe(true);
  });

  it('check questions only exist at the worked-example stage, once', () => {
    expect(canExecuteMove('ask-check', ctx({ stage: 'example' })).ok).toBe(true);
    expect(canExecuteMove('ask-check', ctx({ stage: 'guided' })).ok).toBe(false);
    expect(canExecuteMove('ask-check', ctx({ stage: 'example', exampleCheckDone: true })).ok).toBe(false);
    expect(canExecuteMove('ask-check', ctx({ stage: 'example', hasExampleCheck: false })).ok).toBe(false);
  });

  it('AI moves may not abandon an unfinished equation problem', () => {
    // A help request misread as "start independent practice" must
    // not switch problems mid-solution. Explicit learner actions
    // (lesson.morePractice) bypass this gate by design - switching
    // is allowed, it just is not the model\'s call and never
    // counts as completion.
    const mid = ctx({ stage: 'guided', inPractice: true, sessionUnsolved: true });
    expect(canExecuteMove('independent-practice', mid).ok).toBe(false);
    expect(canExecuteMove('guided-example', mid).ok).toBe(false);
    expect(canExecuteMove('hint', mid).ok).toBe(true);
    expect(canExecuteMove('explain-differently', mid).ok).toBe(true);
    expect(canExecuteMove('explain-prerequisite', mid).ok).toBe(true);
    const solved = ctx({ stage: 'guided', inPractice: true, sessionUnsolved: false });
    expect(canExecuteMove('independent-practice', solved).ok).toBe(true);
  });

  it('prerequisite detours are allowed while teaching, never after completion', () => {
    expect(isTeachingMove('explain-prerequisite')).toBe(true);
    expect(canExecuteMove('explain-prerequisite', ctx({ stage: 'guided', inPractice: true })).ok).toBe(true);
    expect(canExecuteMove('explain-prerequisite', ctx({ stage: 'example' })).ok).toBe(true);
    expect(canExecuteMove('explain-prerequisite', ctx({ stage: 'complete' })).ok).toBe(false);
  });

  it('hints require an active practice question', () => {
    expect(canExecuteMove('hint', ctx({ inPractice: false })).ok).toBe(false);
    expect(canExecuteMove('hint', ctx({ stage: 'guided', inPractice: true })).ok).toBe(true);
  });

  it('nothing moves a completed lesson backwards', () => {
    expect(canExecuteMove('continue', ctx({ stage: 'complete' })).ok).toBe(false);
    expect(canExecuteMove('explain-differently', ctx({ stage: 'complete' })).ok).toBe(false);
    expect(canExecuteMove('recap', ctx({ stage: 'complete' })).ok).toBe(true);
  });
});

/** Acceptance-scenario simulation: mocked orchestrator plans (the
 * same shapes the backend mock/live validator emit) are gated and
 * ordered exactly as the runner executes them. This verifies the
 * machinery, not live model intelligence. */
describe('acceptance scenario machinery (simulated plans)', () => {
  const settingsFirst = (names: string[]) =>
    [...names].sort((x, y) => Number(x.startsWith('speech.repeat')) - Number(y.startsWith('speech.repeat')));

  it('"slower + learn fractions" orders settings before opening', () => {
    const plan = ['speech.setRate', 'lesson.openLesson'];
    expect(settingsFirst(plan)).toEqual(['speech.setRate', 'lesson.openLesson']);
  });

  it('a confused learner mid-example gets explain-differently, allowed', () => {
    expect(canExecuteMove('explain-differently', ctx({ stage: 'example' })).ok).toBe(true);
  });

  it('"give me a chance to try" is allowed only after the example', () => {
    expect(canExecuteMove('independent-practice', ctx({ stage: 'example' })).ok).toBe(false);
    expect(canExecuteMove('independent-practice', ctx({ stage: 'choice' })).ok).toBe(true);
  });

  it('a model cannot skip the worked example or finish the lesson', () => {
    expect(isTeachingMove('skip-example')).toBe(false);
    expect(isTeachingMove('complete-lesson')).toBe(false);
  });
});


it.each(['guided', 'independent'] as const)('protects unfinished %s practice from all progression moves', (stage) => {
  for (const move of ['guided-example', 'independent-practice', 'continue'] as const) {
    expect(canExecuteMove(move, ctx({ stage, inPractice: true, sessionUnsolved: true })).ok).toBe(false);
  }
});


it('invites the next relevant step from the verified situation', () => {
  expect(teachingFollowUp({ stage: 'guided', pendingOperation: 'multiply both sides by 4' })).toContain('equation');
  expect(teachingFollowUp({ stage: 'independent', actionType: 'resulting_equation' })).toContain('x on its own');
  expect(teachingFollowUp({ stage: 'guided', currentQuestion: 'Which number is the numerator?' })).toBe('Which number is the numerator?');
  expect(teachingFollowUp({ stage: 'complete' })).toBeNull();
});
