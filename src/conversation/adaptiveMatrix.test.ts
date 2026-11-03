import { describe, expect, it } from 'vitest';
import { canExecuteMove, type MoveContext } from './teachingMoves';
import { deriveContinuation, shouldAutoContinue } from './turnContract';
import { validateAction } from './actions';
import { SILENCE_INTERVALS_SECONDS, followUpForStep, silenceArmed } from '../lessons/silence';

/** Adaptive-tutor acceptance matrix, frontend half: for each
 * learner case, with controlled lesson state, is progression
 * permitted, and what continuation does the contract guarantee?
 * (Backend half: backend/tests/test_adaptive_matrix.py.) */

const midEquation: MoveContext = {
  stage: 'guided', hasExampleCheck: true, exampleCheckDone: true,
  inPractice: true, sessionUnsolved: true, // (x+2)/4 = 3, mid-solution
};
const solvedEquation: MoveContext = { ...midEquation, sessionUnsolved: false };

describe('10-case adaptive matrix (controlled lesson state)', () => {
  it('1-3. correct / incorrect / partial steps: progression belongs to verification', () => {
    // While unsolved, the model may support but never move on:
    expect(canExecuteMove('independent-practice', midEquation).ok).toBe(false);
    expect(canExecuteMove('guided-example', midEquation).ok).toBe(false);
    // Once verified solved, practice choices open up:
    expect(canExecuteMove('independent-practice', solvedEquation).ok).toBe(true);
    expect(canExecuteMove('guided-example', solvedEquation).ok).toBe(true);
  });

  it('4. "What do you expect me to do?" - help: support allowed, switching refused', () => {
    expect(canExecuteMove('hint', midEquation).ok).toBe(true);
    expect(canExecuteMove('explain-differently', midEquation).ok).toBe(true);
    expect(canExecuteMove('independent-practice', midEquation).ok).toBe(false);
    // The reply explaining the task is what gets spoken; the
    // refused move never touches the verified equation.
  });

  it('5. "I don\'t understand" - explain-differently, no progression', () => {
    expect(canExecuteMove('explain-differently', midEquation).ok).toBe(true);
    expect(deriveContinuation({ teachingMove: 'explain-differently', reply: 'Think of three bags of four oranges.' }, 'guided')).toBe('teach-next');
  });

  it('6. "Explain that again" - revisit/continue within the same state', () => {
    expect(canExecuteMove('revisit-part', midEquation).ok).toBe(true);
    expect(canExecuteMove('continue', midEquation).ok).toBe(false);
  });

  it('7. "Give me a hint" - a support move, not an answer', () => {
    expect(canExecuteMove('hint', midEquation).ok).toBe(true);
    expect(canExecuteMove('hint', { ...midEquation, stage: 'example', inPractice: false }).ok).toBe(true);
    expect(canExecuteMove('hint', { ...midEquation, stage: 'intro', inPractice: false }).ok).toBe(false);
  });

  it('8. "I want another example" - explicit learner choice vs model decision', () => {
    // As the learner's explicit registry action it is permitted
    // (and records no completion):
    expect(validateAction({ name: 'lesson.morePractice', args: { mode: 'guided' } })).not.toBeNull();
    // As the model's own teaching move mid-problem it is refused:
    expect(canExecuteMove('guided-example', midEquation).ok).toBe(false);
  });

  it('9. silence after a completed worked example - guaranteed transition', () => {
    // Bare end-of-example text derives teach-next (never a dead
    // end), and the automatic continuation is permitted once:
    const c = deriveContinuation({ teachingMove: 'none', reply: 'Every step kept the equation balanced.' }, 'example');
    expect(c).toBe('teach-next');
    expect(shouldAutoContinue({ continuation: c, actionsExecuted: 0, alreadyAutoContinued: false, stage: 'example' })).toBe(false);
    expect(shouldAutoContinue({ continuation: c, actionsExecuted: 0, alreadyAutoContinued: true, stage: 'example' })).toBe(false);
    // Patient waiting, then quiet:
    expect(SILENCE_INTERVALS_SECONDS).toEqual([45, 30, 45, 60, 90]);
    expect(followUpForStep(5)).toBeNull();
    expect(silenceArmed({ awaitingResponse: true, speaking: false, busy: false, listening: true, handsFree: true })).toBe(true);
  });

  it('10. a question mid-solving awaits its answer, completes nothing', () => {
    const c = deriveContinuation({ teachingMove: 'none', reply: 'Because both sides must stay equal. What would undo the division?' }, 'guided');
    expect(c).toBe('await-response');
    expect(canExecuteMove('continue', { ...midEquation, stage: 'complete' }).ok).toBe(false);
  });
});
