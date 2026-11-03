import type { LessonStage } from '../lessons/intent';

/** Teaching moves the central orchestrator may propose. The lesson
 * engine — never the model — decides whether a move is allowed from
 * the current stage. No move can complete a lesson, judge
 * mathematics, or invent content: moves only select among curated
 * explanations, checked examples and verified practice. */

export type TeachingMove =
  | 'explain-differently' | 'ask-check' | 'guided-example'
  | 'independent-practice' | 'hint' | 'continue' | 'revisit-part'
  | 'recap' | 'explain-prerequisite' | 'none';

export const TEACHING_MOVES: ReadonlySet<string> = new Set<TeachingMove>([
  'explain-differently', 'ask-check', 'guided-example', 'independent-practice',
  'hint', 'continue', 'revisit-part', 'recap', 'explain-prerequisite', 'none',
]);

export interface MoveContext {
  stage: LessonStage;
  hasExampleCheck: boolean;
  exampleCheckDone: boolean;
  /** True while the learner is answering practice (either kind). */
  inPractice: boolean;
  /** An equation problem is active and not yet verified solved.
   * AI teaching moves may support the learner within it, but may
   * not abandon it for a new problem - switching is the learner's
   * explicit action (lesson.morePractice), never the model's
   * interpretation of a help request. */
  sessionUnsolved?: boolean;
}

export function isTeachingMove(value: unknown): value is TeachingMove {
  return typeof value === 'string' && TEACHING_MOVES.has(value);
}

/** Stage preconditions: the authoritative gate between an AI
 * proposal and a lesson state change. */
export function canExecuteMove(move: TeachingMove, ctx: MoveContext): { ok: boolean; reason?: string } {
  switch (move) {
    case 'none': return { ok: true };
    case 'recap': return { ok: true };
    case 'revisit-part': return { ok: true };
    case 'explain-differently':
      return ctx.stage === 'complete'
        ? { ok: false, reason: 'lesson already complete' }
        : { ok: true };
    case 'ask-check':
      if (!ctx.hasExampleCheck) return { ok: false, reason: 'no check question in this lesson' };
      if (ctx.exampleCheckDone) return { ok: false, reason: 'check already answered' };
      return ctx.stage === 'example'
        ? { ok: true }
        : { ok: false, reason: 'check belongs to the worked example stage' };
    case 'guided-example':
      if (ctx.sessionUnsolved) return { ok: false, reason: 'current problem is unfinished' };
      return ctx.stage === 'intro'
        ? { ok: false, reason: 'introduction comes first' }
        : { ok: true };
    case 'independent-practice':
      if (ctx.sessionUnsolved) return { ok: false, reason: 'current problem is unfinished' };
      // Independent practice requires the concept and worked example
      // to have been presented; it is never a first contact.
      return ctx.stage === 'intro' || ctx.stage === 'example'
        ? { ok: false, reason: 'worked example comes first' }
        : { ok: true };
    case 'hint':
      return ctx.inPractice || ctx.stage === 'example'
        ? { ok: true }
        : { ok: false, reason: 'no active practice question' };
    case 'explain-prerequisite':
      // A short, safe detour: allowed wherever teaching is live,
      // never after completion. The original lesson state is kept
      // untouched by the learning-context stack.
      return ctx.stage === 'complete'
        ? { ok: false, reason: 'lesson already complete' }
        : { ok: true };
    case 'continue':
      if (ctx.sessionUnsolved) return { ok: false, reason: 'current question is unfinished' };
      return ctx.stage === 'complete'
        ? { ok: false, reason: 'lesson already complete' }
        : { ok: true };
    default: return { ok: false, reason: 'unknown move' };
  }
}
