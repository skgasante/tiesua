import { checkedFractionIntroduction } from '../fractionIntroduction';
import type { LessonDef } from '../catalogue';
import { EQUATION_JOURNEY, TEACHING_STEP_COUNT } from '../equationJourney';

/** Solving Equations with a Fraction - JHS 1 Equations.
 * Practice problems live in the verified problem bank (src/learn/problems.ts). */
export const EQUATIONS_FRACTION: LessonDef = {
  id: 'equations-fraction',
  level: 'Junior High 1',
  topic: 'Equations',
  title: 'Solving Equations with a Fraction',
  objective: 'Solve an equation like (x+2)/4 = 3 by undoing the division and checking every step.',
  keywords: ['equation', 'equations', 'solve', 'solving', 'unknown', 'algebra', 'x'],
  intro: [
    'Today we will learn to find a missing number in an equation with a fraction.',
    'We will start with a simple sweets story, then use what we learn to solve the equation. Shall we begin?' ,
  ],
  example: {
    expression: '(x+2)/4 = 3',
    steps: EQUATION_JOURNEY.slice(0, TEACHING_STEP_COUNT).map(step => ({ title: step.title, expression: step.expression ?? '', explanation: step.title === 'A new way to write division' ? checkedFractionIntroduction(step.prompt) : step.prompt, guidance: step.guidance, numericAnswer: step.numericAnswer, successFeedback: step.successFeedback })),
    explanation: [
      'We begin by sharing sweets equally. We connect that experience to division, fraction notation and finding a missing number.',
      'Each question builds on the idea the learner has just explained. Mathematical practice is checked independently.',
    ],
  },
  simpler: [
    'Think of the equals sign like a balance. Both sides must weigh the same.',
    'If we add or multiply on one side only, the balance tips. So whatever we do, we do it on both sides.',
    'Here, four divides the whole of x plus two. Multiplying by four undoes that division. We do it to both sides.',
  ],
  clarifyHint: 'uses a fraction inside an equation to find x',
  kind: 'equations',
  guidedProblemId: 'fraction-plus-three-fifths',
  independentProblemId: 'fraction-plus-one-thirds',
  extraProblemIds: ['add-unknown', 'multiply-unknown', 'subtract-unknown', 'two-steps', 'double-bracket'],
  recap: 'You learned to undo "all over" by multiplying both sides, keep the two sides balanced, and reach x one careful step at a time.',
  nextId: null,
};
