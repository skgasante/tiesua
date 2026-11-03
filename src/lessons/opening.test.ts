import { expect, it } from 'vitest';
import { equationOpening } from './opening';

const brief = 'Find a missing number in an equation with a fraction. We will start with a sweets story. Shall we begin?';
it('replaces the reported regressed opening with the checked brief', () => {
  expect(equationOpening('Welcome. We will solve equations with sharing, like sweets for friends. Shall we start with sharing sweets?', brief)).toBe(brief);
});
it('preserves a model variation with the goal and story bridge', () => {
  const variation = 'Let us find an unknown number in an equation with a fraction. First, we will use a sweets story. Ready to begin?';
  expect(equationOpening(variation, brief)).toBe(variation);
});
it('uses the checked brief when the model supplies no opening', () => {
  expect(equationOpening('', brief)).toBe(brief);
});
