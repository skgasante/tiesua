/** Safe action registry. These are the ONLY actions a learner
 * request — local or Meta-proposed — can ever execute. The Meta
 * interpreter proposes entries; the executor re-validates the name
 * and every argument here and rejects anything else. No action can
 * touch mathematical truth: steps still go through the verifier. */

export type ActionName =
  | 'speech.setRate' | 'speech.setPauses' | 'speech.setVolume'
  | 'speech.previewVoice' | 'speech.repeatProblem' | 'speech.repeatCurrent'
  | 'speech.stop' | 'conversation.end' | 'conversation.wait' | 'confirmation.accept' | 'confirmation.decline' | 'help.guide' | 'help.offerLessons' | 'help.tutorialNext' | 'help.tutorialExit' | 'demo.hearOrdinary' | 'demo.hearClear'
  | 'lesson.explainPart' | 'lesson.hint' | 'lesson.explainStep' | 'lesson.recap'
  | 'lesson.easierProblem' | 'lesson.nextProblem' | 'lesson.restart'
  | 'lesson.undoStep' | 'lesson.continue' | 'lesson.reviewPrevious' | 'lesson.reviewNext' | 'lesson.returnCurrent'
  | 'lesson.repeatLesson' | 'lesson.nextLesson' | 'lesson.morePractice' | 'lesson.openLesson'
  | 'nav.goHome' | 'nav.openHear' | 'nav.openLearn' | 'nav.openLessons' | 'nav.openSettings'
  | 'display.setTextSize'
  | 'reading.temporaryStyle';

export interface ProposedAction {
  name: ActionName;
  args: Record<string, unknown>;
  /** Temporary adjustments expire at a boundary instead of
   * overwriting the learner's persistent preferences. */
  scope?: 'persistent' | 'temporary';
}

const NAMES: ReadonlySet<string> = new Set<ActionName>([
  'speech.setRate', 'speech.setPauses', 'speech.setVolume',
  'speech.previewVoice', 'speech.repeatProblem', 'speech.repeatCurrent',
  'speech.stop', 'conversation.end', 'conversation.wait', 'confirmation.accept', 'confirmation.decline', 'help.guide', 'help.offerLessons', 'help.tutorialNext', 'help.tutorialExit', 'demo.hearOrdinary', 'demo.hearClear', 'lesson.explainPart', 'lesson.hint', 'lesson.explainStep',
  'lesson.recap', 'lesson.easierProblem', 'lesson.nextProblem', 'lesson.restart',
  'lesson.reviewPrevious', 'lesson.reviewNext', 'lesson.returnCurrent', 'lesson.undoStep', 'lesson.continue', 'lesson.repeatLesson', 'lesson.nextLesson',
  'lesson.morePractice', 'lesson.openLesson', 'nav.goHome', 'nav.openHear',
  'nav.openLearn', 'nav.openLessons', 'nav.openSettings', 'display.setTextSize', 'reading.temporaryStyle',
]);

/** Actions actually supported by the active executor. */
export function availableActions(screen: string): ActionName[] {
  const shared: ActionName[] = ['speech.setRate', 'speech.setPauses', 'speech.setVolume', 'speech.previewVoice',
    'speech.stop', 'conversation.end', 'conversation.wait', 'help.guide', 'demo.hearOrdinary', 'demo.hearClear', 'nav.goHome', 'nav.openHear', 'nav.openLearn',
    'nav.openLessons', 'nav.openSettings', 'display.setTextSize', 'reading.temporaryStyle'];
  if (screen !== 'lesson') return [...shared, 'help.offerLessons', 'lesson.openLesson'];
  return [...shared, 'speech.repeatProblem', 'speech.repeatCurrent', 'lesson.explainPart', 'lesson.hint',
    'lesson.explainStep', 'lesson.recap', 'lesson.easierProblem', 'lesson.nextProblem', 'lesson.restart',
    'lesson.reviewPrevious', 'lesson.reviewNext', 'lesson.returnCurrent', 'lesson.undoStep', 'lesson.continue', 'lesson.repeatLesson', 'lesson.nextLesson', 'lesson.morePractice', 'lesson.openLesson'];
}

export const DESTRUCTIVE: ReadonlySet<ActionName> = new Set([
  'lesson.restart', 'lesson.easierProblem', 'lesson.nextProblem', 'lesson.undoStep',
]);

const num = (v: unknown, min: number, max: number): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null;

/** Validate (and clamp) a proposed action. Returns null if the
 * action or its arguments are not exactly as the registry allows. */
export function validateAction(raw: unknown): ProposedAction | null {
  if (!raw || typeof raw !== 'object') return null;
  const candidate = raw as { name?: unknown; args?: unknown; scope?: unknown };
  if (typeof candidate.name !== 'string' || !NAMES.has(candidate.name)) return null;
  const name = candidate.name as ActionName;
  const args = (candidate.args && typeof candidate.args === 'object' ? candidate.args : {}) as Record<string, unknown>;
  const scope = candidate.scope === 'temporary' ? 'temporary' : 'persistent';
  switch (name) {
    case 'speech.setRate': {
      const value = num(args.value, 0.6, 2.5); const delta = num(args.delta, -0.6, 0.6);
      if (value === null && delta === null) return null;
      return { name, args: value !== null ? { value } : { delta }, scope };
    }
    case 'speech.setPauses': {
      const value = num(args.value, 0, 2); const delta = num(args.delta, -1, 1);
      if (value === null && delta === null) return null;
      return { name, args: value !== null ? { value } : { delta }, scope };
    }
    case 'speech.setVolume': {
      const value = num(args.value, 0.2, 1); const delta = num(args.delta, -0.5, 0.5);
      if (value === null && delta === null) return null;
      return { name, args: value !== null ? { value } : { delta }, scope };
    }
    case 'speech.previewVoice': {
      const direction = args.direction;
      if (direction !== 'next' && direction !== 'previous' && direction !== 'descriptor' && direction !== 'keep') return null;
      const descriptor = typeof args.descriptor === 'string' ? args.descriptor.slice(0, 40) : undefined;
      return { name, args: { direction, ...(descriptor ? { descriptor } : {}) } };
    }
    case 'lesson.explainPart': {
      const part = args.part;
      if (part !== 'numerator' && part !== 'denominator' && part !== 'left' && part !== 'right' && part !== 'whole') return null;
      return { name, args: { part } };
    }
    case 'display.setTextSize': {
      const value = num(args.value, 100, 200);
      if (value === null || ![100, 125, 150, 200].includes(value)) return null;
      return { name, args: { value } };
    }
    case 'reading.temporaryStyle': {
      const style = args.style;
      if (style !== 'slow' && style !== 'detailed' && style !== 'slow-detailed') return null;
      return { name, args: { style }, scope: 'temporary' };
    }
    case 'lesson.morePractice': {
      const mode = args.mode;
      if (mode !== 'guided' && mode !== 'independent') return null;
      return { name, args: { mode } };
    }
    case 'lesson.openLesson': {
      const query = args.query;
      if (typeof query !== 'string' || !query.trim() || query.length > 60) return null;
      return { name, args: { query: query.trim() } };
    }
    default:
      return { name, args: {} };
  }
}
