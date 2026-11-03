/** Local learner progress: completed lessons and last activity.
 * Stored only in this browser (no accounts). Repeating a lesson
 * increments its completion count - it never erases history. */

export interface Progress {
  completed: Record<string, { completions: number; lastCompleted: string }>;
  lastLessonId?: string;
  lastActivity?: string;
}

const KEY = 'tiesua-progress';
const EMPTY: Progress = { completed: {} };

type Store = { getItem(k: string): string | null; setItem(k: string, v: string): void };
const defaultStore = (): Store | null => {
  try { return window.localStorage; } catch { return null; }
};

export function loadProgress(store: Store | null = defaultStore()): Progress {
  if (!store) return { ...EMPTY };
  try {
    const parsed = JSON.parse(store.getItem(KEY) ?? '') as Progress;
    return { completed: parsed.completed ?? {}, lastLessonId: parsed.lastLessonId, lastActivity: parsed.lastActivity };
  } catch { return { ...EMPTY }; }
}

export function saveProgress(progress: Progress, store: Store | null = defaultStore()): void {
  try { store?.setItem(KEY, JSON.stringify(progress)); } catch { /* storage is best-effort */ }
}

export function markCompleted(progress: Progress, lessonId: string, now = new Date().toISOString()): Progress {
  const previous = progress.completed[lessonId];
  return {
    ...progress,
    completed: {
      ...progress.completed,
      [lessonId]: { completions: (previous?.completions ?? 0) + 1, lastCompleted: now },
    },
    lastLessonId: lessonId,
    lastActivity: now,
  };
}

export function recordActivity(progress: Progress, lessonId: string, now = new Date().toISOString()): Progress {
  return { ...progress, lastLessonId: lessonId, lastActivity: now };
}

export function isCompleted(progress: Progress, lessonId: string): boolean {
  return (progress.completed[lessonId]?.completions ?? 0) > 0;
}
