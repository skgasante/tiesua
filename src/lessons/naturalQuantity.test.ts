import { expect, it } from 'vitest';
import { checkFractionItem, interpretNumericAnswer } from './checker';
it.each(['three sweets', 'three sweets each', 'each friend gets three sweets', 'they have three sweets'])('checks a natural quantity: %s', answer => {
  expect(checkFractionItem(3, answer)).toBe(true);
  expect(checkFractionItem(4, answer)).toBe(false);
});
it.each(['I was asking if it was four sweets', 'I asked whether it was three sweets', 'Is it three sweets?', 'I do not understand three sweets'])('does not grade a question or confusion: %s', text => {
  expect(interpretNumericAnswer(text)).toBeNull();
});
it('does not silently turn a homophone into the expected answer', () => {
  expect(checkFractionItem(4, 'for sweets')).toBeNull();
});
