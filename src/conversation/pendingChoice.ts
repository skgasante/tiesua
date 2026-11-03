import type { ProposedAction } from './actions';
import type { LessonDef } from '../lessons/catalogue';

/** Shared pending-choice context.
 *
 * When TieSua offers spoken choices (on any screen), the options
 * and their SPOKEN order are remembered here - one store shared by
 * Home, the global conversation bar and the lesson runner, so a
 * choice survives navigation between screens. The orchestrator
 * resolves follow-ups ("the second one", "not that one") against
 * exactly this list; the executor only stores and reports it.
 * In-memory only: a refresh simply means no pending choice. */

export interface PendingChoice {
  options: SpokenOption[];
  /** The exact spoken question that presented the options. */
  question: string;
}

export type SpokenOption = Pick<LessonDef, 'id' | 'title'> & { action?: ProposedAction };

let pending: PendingChoice | null = null;

export function setPendingChoice(options: SpokenOption[], question: string): void {
  pending = options.length ? { options: [...options], question } : null;
}

export function getPendingChoice(): PendingChoice | null {
  return pending ? { options: [...pending.options], question: pending.question } : null;
}

export function clearPendingChoice(): void {
  pending = null;
}

/** Context shape sent to the orchestrator on every turn. */
export function pendingChoiceContext(): { id: string; title: string; action: ProposedAction }[] {
  return pending?.options.map((l) => ({ id: l.id, title: l.title, action: l.action ?? { name: 'lesson.openLesson', args: { query: l.id } } })) ?? [];
}


/** Ordinals only resolve against the exact registered spoken list. */
export function resolvePendingAction(text: string): ProposedAction | null {
  const match = text.toLowerCase().trim().match(/^(?:the |option |number )?(first|second|third|fourth|1|2|3|4)(?: one| option)?[.!]?$/);
  if (!match || !pending) return null;
  const index = ({ first: 0, second: 1, third: 2, fourth: 3, '1': 0, '2': 1, '3': 2, '4': 3 } as Record<string, number>)[match[1]];
  const option = pending.options[index];
  if (!option) return null;
  pending = null;
  return option.action ?? { name: 'lesson.openLesson', args: { query: option.title } };
}
