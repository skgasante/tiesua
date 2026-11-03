import { parseExpression } from '../math/parser';
import { toSpeechPlan, type SpeechPlan } from '../speech/speechPlan';
import { validateAction, type ProposedAction } from './actions';

export interface SharedSettings { rate: number; pauseScale: number; volume: number; textSize: number }
export type Destination = 'home' | 'lessons' | 'lesson' | 'explore' | 'settings';
export interface ActionEnvironment {
  settings: SharedSettings;
  patch: (patch: Partial<SharedSettings>) => void;
  temporary: (patch: Partial<SharedSettings>) => void;
  navigate: (view: Destination) => void;
  stop: () => void;
  endConversation?: () => void;
  waitForLearner?: () => void;
  guide?: () => void;
  demonstrate?: (plan: SpeechPlan) => void;
}
export interface ActionOutcome { action: ProposedAction; message: string }

/** A turn may adjust settings alongside ONE change of activity or lesson
 * state. Repeated identical proposals are one action; conflicting changes
 * must be clarified before anything executes. */
export function changesLearningState(action: ProposedAction): boolean {
  return action.name.startsWith('nav.') || [
    'lesson.continue', 'lesson.morePractice', 'lesson.nextProblem', 'lesson.easierProblem',
    'lesson.openLesson', 'lesson.nextLesson', 'lesson.restart', 'lesson.repeatLesson', 'lesson.undoStep',
  ].includes(action.name);
}

export function normalizeTurnActions(actions: ProposedAction[]): ProposedAction[] | null {
  const unique = actions.filter((action, index) => actions.findIndex(other =>
    other.name === action.name && JSON.stringify(other.args) === JSON.stringify(action.args)
    && other.scope === action.scope) === index);
  return unique.filter(changesLearningState).length > 1 ? null : unique;
}

/** Shared application capabilities. Lesson operations remain with the lesson
 * engine; every screen uses these same validated settings/navigation rules. */
export function executeSharedAction(raw: unknown, env: ActionEnvironment): ActionOutcome | null {
  const action = validateAction(raw);
  if (!action) return null;
  const outcome = (message: string): ActionOutcome => ({ action, message });
  const fields: Partial<Record<ProposedAction['name'], keyof SharedSettings>> = {
    'speech.setRate': 'rate', 'speech.setPauses': 'pauseScale', 'speech.setVolume': 'volume', 'display.setTextSize': 'textSize',
  };
  const field = fields[action.name];
  if (field) {
    const [min, max] = field === 'rate' ? [.6, 2.5] : field === 'pauseScale' ? [0, 2] : field === 'volume' ? [.2, 1] : [100, 200];
    const value = Math.min(max, Math.max(min, typeof action.args.value === 'number' ? action.args.value : env.settings[field] + Number(action.args.delta ?? 0)));
    const patch = { [field]: value };
    if (action.scope === 'temporary') env.temporary(patch); else env.patch(patch);
    if (field === 'rate') {
      return outcome(value < env.settings.rate ? 'I will speak more slowly.'
        : value > env.settings.rate ? 'I will speak faster.' : 'The speaking speed is already at that setting.');
    }
    return outcome(action.scope === 'temporary' ? 'I will use that for this response.' : 'Your setting has been changed.');
  }
  const destination: Partial<Record<ProposedAction['name'], Destination>> = {
    'nav.goHome': 'home', 'nav.openLessons': 'lessons', 'nav.openLearn': 'lessons',
    'nav.openHear': 'explore', 'nav.openSettings': 'settings',
  };
  const view = destination[action.name];
  if (view) { env.navigate(view); return outcome(view === 'explore' ? 'Hear the Difference is open.' : `Opening ${view}.`); }
  if (action.name === 'demo.hearOrdinary' || action.name === 'demo.hearClear') {
    if (!env.demonstrate) return null;
    const mode = action.name === 'demo.hearOrdinary' ? 'ordinary' : 'natural';
    const first = toSpeechPlan(parseExpression('(x+2)/4'), mode);
    const second = toSpeechPlan(parseExpression('x+(2/4)'), mode);
    env.demonstrate({ mode, segments: [
      ...first.segments,
      { id: 'contrast', nodeId: 'contrast', text: 'And the second expression.', pauseAfterMs: 400, boundary: 'phrase' },
      ...second.segments,
    ] });
    return outcome('');
  }
  if (action.name === 'speech.stop') { env.stop(); return outcome(''); }
  if (action.name === 'help.guide') { if (!env.guide) return null; env.guide(); return outcome(''); }
  if (action.name === 'conversation.end') {
    if (!env.endConversation) return null;
    env.endConversation();
    return outcome('Conversation stopped. The microphone is off.');
  }
  if (action.name === 'conversation.wait') {
    if (!env.waitForLearner) return null;
    env.waitForLearner();
    return outcome('Take your time. I will wait until you are ready.');
  }
  return null;
}


/** Model-selected actions cannot abandon work on the strength of a help turn. */
export const DEPARTURE_ACTIONS = new Set<ProposedAction['name']>([
    'lesson.morePractice', 'lesson.nextProblem', 'lesson.easierProblem', 'lesson.repeatLesson',
    'lesson.nextLesson', 'lesson.openLesson', 'lesson.restart', 'lesson.continue',
    'nav.goHome', 'nav.openHear', 'nav.openLearn', 'nav.openLessons',
]);
export function canExecuteLessonAction(action: ProposedAction, unfinished: boolean, _utterance: string): boolean {
  return !unfinished || !DEPARTURE_ACTIONS.has(action.name);
}
