import { expect, it } from 'vitest';
import { returningLearner } from './homeWelcome';
const store = (values: Record<string, string>) => ({ getItem: (key: string) => values[key] ?? null });
it('distinguishes new learners from returning learners and existing progress', () => {
  expect(returningLearner(store({}))).toBe(false);
  expect(returningLearner(store({ 'tiesua-visited': '1' }))).toBe(true);
  expect(returningLearner(store({ 'tiesua-progress': JSON.stringify({ lastLessonId: 'equations-fraction' }) }))).toBe(true);
  expect(returningLearner(store({ 'tiesua-progress': 'bad json' }))).toBe(false);
});
