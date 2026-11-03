/** Structured lesson catalogue: Level -> Topic -> Lesson.
 * Stable ids, explicit progression (nextId), and completion rules
 * grounded in learner progress - never in "one problem finished".
 * Only lessons whose content is fully implemented and verified are
 * `ready`; the rest of the Ghana curriculum is honestly listed as
 * coming soon and can never be routed to. */

export interface FractionItem {
  prompt: string;
  answer: number;
  teach: string;
}

export interface LessonDef {
  id: string;
  level: string;
  topic: string;
  title: string;
  objective: string;
  keywords: string[];
  intro: string[];
  example: { expression: string; explanation: string[]; steps?: { title?: string; expression: string; explanation: string; guidance?: string; numericAnswer?: number; successFeedback?: string }[] };
  /** The same ideas in easier words, for "I still don't get it". */
  simpler: string[];
  /** One-line distinction used only when a request is genuinely
   * ambiguous between lessons. */
  clarifyHint: string;
  /** Optional interactive check inside the worked example. */
  exampleCheck?: { prompt: string; answer: number; teach: string };
  kind: 'fractions' | 'equations';
  /** fractions lessons: curated, deterministically checked items */
  guidedItems?: FractionItem[];
  guidedExtraItems?: FractionItem[];
  independentItems?: FractionItem[];
  /** equations lessons: problem-bank ids solved through the verifier */
  guidedProblemId?: string;
  independentProblemId?: string;
  extraProblemIds?: string[];
  recap: string;
  nextId: string | null;
}

import { EQUATIONS_FRACTION } from './content/equationsFraction';

/** The implemented lessons. Content lives one file per lesson under
 * content/ so the curriculum grows by adding a file and registering
 * it here - the contract tests validate every registration. */
export const LESSONS: LessonDef[] = [EQUATIONS_FRACTION];

/* eslint-disable */
export const LESSON_ORDER = LESSONS.map((l) => l.id);

export function getLesson(id: string): LessonDef | undefined {
  return LESSONS.find((l) => l.id === id);
}

/** The next ready lesson in the intended learning sequence. */
export function nextReadyLesson(id: string): LessonDef | null {
  const lesson = getLesson(id);
  if (!lesson?.nextId) return null;
  return getLesson(lesson.nextId) ?? null;
}

const norm = (t: string) => t.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();

/** Ready lessons matching a spoken topic request, best first. */
export function matchLessons(query: string): LessonDef[] {
  const q = ` ${norm(query)} `;
  const scored = LESSONS.map((lesson) => {
    let score = 0;
    for (const kw of lesson.keywords) if (q.includes(` ${kw} `) || q.trim() === kw) score += kw.split(' ').length + 1;
    if (q.includes(norm(lesson.topic))) score += 2;
    if (q.includes(norm(lesson.title))) score += 3;
    return { lesson, score };
  }).filter((s) => s.score > 0);
  return scored.sort((a, b) => b.score - a.score).map((s) => s.lesson);
}

export type LessonResolution =
  | { kind: 'open'; lesson: LessonDef }
  | { kind: 'ambiguous'; options: LessonDef[] }
  | { kind: 'none' };

/** Decisive executor resolution of an AI-chosen lesson query.
 * An exact title/topic match opens directly - a shared word
 * ("fraction" appears in several lessons) must never turn an
 * exact request into a menu. Only a genuinely close call is
 * ambiguous. This executes a choice; it never interprets one. */
export function resolveLessonQuery(query: string): LessonResolution {
  const byId = getLesson(query.trim().toLowerCase());
  if (byId) return { kind: 'open', lesson: byId };
  const q = norm(query);
  const exact = LESSONS.find((l) => norm(l.title) === q || norm(l.topic) === q);
  if (exact) return { kind: 'open', lesson: exact };
  const matches = matchLessons(query);
  if (!matches.length) return { kind: 'none' };
  if (matches.length === 1) return { kind: 'open', lesson: matches[0] };
  // Ranked margin: reuse matchLessons ordering; a title-bearing
  // query (contains a full lesson title) is decisive by itself.
  const titleHit = matches.find((l) => q.includes(norm(l.title)));
  if (titleHit) return { kind: 'open', lesson: titleHit };
  return { kind: 'ambiguous', options: matches };
}

/** Catalogue display structure (ready lessons + honest placeholders). */
export const CATALOGUE_DISPLAY: { level: string; topics: { topic: string; lessons: { title: string; lessonId?: string }[] }[] }[] = [
  {
    level: 'Junior High 1',
    topics: [
      {
        topic: 'Fractions',
        lessons: [
          { title: 'Equivalent fractions' },
          { title: 'Adding fractions with the same denominator' },
        ],
      },
      {
        topic: 'Equations',
        lessons: [
          { title: 'Solving Equations with a Fraction', lessonId: 'equations-fraction' },
          { title: 'One-step equations' },
        ],
      },
    ],
  },
  {
    level: 'Junior High 2',
    topics: [
      { topic: 'Equations', lessons: [{ title: 'Two-step equations' }] },
      { topic: 'Ratio and proportion', lessons: [{ title: 'Sharing in a ratio' }] },
    ],
  },
];

/** Structured catalogue for the orchestrator context: what can
 * really be taught now, and what is honestly still coming. The
 * model words the overview; it never invents entries. */
export function catalogueContext(): { topic: string; ready: string[]; comingSoon: string[] }[] {
  const out: { topic: string; ready: string[]; comingSoon: string[] }[] = [];
  for (const lvl of CATALOGUE_DISPLAY) {
    for (const t of lvl.topics) {
      const entry = out.find((e) => e.topic === t.topic) ?? { topic: t.topic, ready: [], comingSoon: [] };
      for (const l of t.lessons) (l.lessonId ? entry.ready : entry.comingSoon).push(l.title);
      if (!out.includes(entry)) out.push(entry);
    }
  }
  return out;
}
