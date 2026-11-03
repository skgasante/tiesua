import { expect, it } from 'vitest';
import { normalizeTurnActions } from './actionExecutor';
import type { ProposedAction } from './actions';

it('deduplicates repeated activity proposals across screens', () => {
  const action: ProposedAction = { name: 'nav.openLessons', args: {} };
  expect(normalizeTurnActions([action, action])).toEqual([action]);
});

it('rejects conflicting navigation and lesson changes before execution', () => {
  expect(normalizeTurnActions([
    { name: 'nav.goHome', args: {} }, { name: 'lesson.continue', args: {} },
  ])).toBeNull();
});

it('allows a speech setting followed by a single lesson transition', () => {
  const actions: ProposedAction[] = [
    { name: 'speech.setRate', args: { delta: -0.2 } },
    { name: 'lesson.morePractice', args: { mode: 'guided' } },
  ];
  expect(normalizeTurnActions(actions)).toEqual(actions);
});
