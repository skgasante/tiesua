export function returningLearner(storage: Pick<Storage, 'getItem'>): boolean {
  try {
    if (storage.getItem('tiesua-visited') === '1') return true;
    const progress = JSON.parse(storage.getItem('tiesua-progress') ?? '{}');
    return Boolean(progress.lastLessonId || progress.lastActivity || Object.keys(progress.completed ?? {}).length);
  } catch { return false; }
}
