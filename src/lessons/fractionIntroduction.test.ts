import { expect, it } from 'vitest';
import { EQUATION_JOURNEY } from './equationJourney';
import { checkedFractionIntroduction, FRACTION_DIVISION_INTRODUCTION, hasDivisionFractionBridge } from './fractionIntroduction';

it('requires the notation bridge in the actual authored step', () => {
  const step = EQUATION_JOURNEY.find(s => s.title === 'A new way to write division')!;
  expect(hasDivisionFractionBridge(step.prompt)).toBe(true);
});
it('rejects the previously reported positional explanation', () => {
  const old = 'On the left hand side, twelve divided by four becomes twelve over four. Twelve is above the fraction line; four is below it. Three remains on the right hand side. What operation does the fraction line mean?';
  expect(hasDivisionFractionBridge(old)).toBe(false);
  expect(checkedFractionIntroduction(old)).toBe(FRACTION_DIVISION_INTRODUCTION);
});
it('keeps the approved introduction and rejects removal of each essential idea', () => {
  expect(checkedFractionIntroduction(FRACTION_DIVISION_INTRODUCTION)).toBe(FRACTION_DIVISION_INTRODUCTION);
  for (const fragment of ['A fraction is another way to write division.', 'The line means divided by.', 'left hand side', 'right hand side', 'above', 'below']) {
    expect(hasDivisionFractionBridge(FRACTION_DIVISION_INTRODUCTION.replace(fragment, ''))).toBe(false);
  }
});
