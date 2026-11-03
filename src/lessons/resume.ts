/** Mid-lesson resume snapshot (this browser only).
 * Stores where the learner was - never mathematical truth. Equation
 * sessions live in backend RAM, so an old session is never assumed
 * restorable: the runner restarts the current question honestly
 * when the old session cannot be used. */

export interface LessonSnapshot {
  lessonId: string;
  stage: string;
  itemSet: 'guided' | 'extra' | 'independent';
  itemIndex: number;
  support: 'guided' | 'independent';
  problemId: string | null;
  /** A live server session can be resumed after navigation; if the server
   * restarted, the caller must not assume that its state still exists. */
  sessionId?: string | null;
  /** Index into the lesson's own worked-example steps. */
  exampleStep?: number;
  exampleVersion?: number;
  savedAt: string;
}

const KEY = 'tiesua-lesson-resume';

export function saveSnapshot(snapshot: LessonSnapshot): void {
  try { localStorage.setItem(`${KEY}:${snapshot.lessonId}`, JSON.stringify(snapshot)); } catch { /* best-effort */ }
}

export function loadSnapshot(lessonId: string): LessonSnapshot | null {
  try {
    const parsed = JSON.parse(localStorage.getItem(`${KEY}:${lessonId}`) ?? localStorage.getItem(KEY) ?? '') as LessonSnapshot;
    if (parsed.lessonId !== lessonId || !parsed.stage) return null;
    return parsed;
  } catch { return null; }
}

export function clearSnapshot(lessonId: string): void {
  try {
    localStorage.removeItem(`${KEY}:${lessonId}`);
    const legacy = localStorage.getItem(KEY);
    if (legacy) { try { if (JSON.parse(legacy).lessonId === lessonId) localStorage.removeItem(KEY); } catch { /* leave unrelated data */ } }
  } catch { /* best-effort */ }
}
