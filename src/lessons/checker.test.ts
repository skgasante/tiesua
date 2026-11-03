import { describe, expect, it } from 'vitest';
import { checkFractionItem, equationSubmission, interpretNumericAnswer } from './checker';

describe('verbal arithmetic answers (owner failure regression)', () => {
  it('understands a spoken calculation as its result', () => {
    // The owner's exact failure: this was judged wrong because the
    // parser grabbed the first number ("three") instead of 12.
    expect(interpretNumericAnswer('Three times four makes twelve')).toEqual({ value: 12, description: '3 × 4 = 12' });
    expect(checkFractionItem(12, 'Three times four makes twelve')).toBe(true);
    expect(checkFractionItem(12, 'Three times four is twelve.')).toBe(true);
    expect(checkFractionItem(12, 'Three multiplied by four gives twelve')).toBe(true);
    expect(checkFractionItem(12, 'Four plus four plus four is twelve')).toBe(true);
  });

  it('still accepts plain forms and judges wrong claims honestly', () => {
    expect(checkFractionItem(12, '12')).toBe(true);
    expect(checkFractionItem(12, 'Twelve')).toBe(true);
    expect(checkFractionItem(12, 'three times four')).toBe(true); // computed, unstated
    expect(checkFractionItem(12, 'Three times four makes thirteen')).toBe(false); // wrong claim
    expect(checkFractionItem(3, 'four')).toBe(false);
  });

  it('never guesses among several bare numbers', () => {
    expect(interpretNumericAnswer('the top one')).toBeNull();
    expect(checkFractionItem(3, 'the top one')).toBeNull();
    expect(checkFractionItem(5, 'the denominator is five')).toBe(true);
    expect(interpretNumericAnswer('maybe two or three')).toBeNull();
  });
});


describe('purpose before quantity', () => {
  it.each(["I don't understand three times four", 'Is three times four twelve?', 'What do you expect me to do?', 'Please explain twelve', 'Can I say twelve'])('does not grade %s', (text) => {
    expect(checkFractionItem(12, text)).toBeNull();
  });
  it.each([['Negative five', -5], ['One hundred', 100], ['The answer is ten', 10], ['X equals to ten', 10]])('understands %s', (text, expected) => {
    expect(checkFractionItem(Number(expected), String(text))).toBe(true);
  });
});


it('does not take an incidental number or false calculation as mastery', () => {
  expect(checkFractionItem(12, 'I want another example with twelve')).toBeNull();
  expect(checkFractionItem(12, 'two plus two makes twelve')).toBe(false);
});


it('uses a bare value only in response to an explicit question about x', () => {
  expect(equationSubmission('Ten', 'What is the value of x?')).toBe('x = 10');
  expect(equationSubmission('Ten', 'What step will you try first?')).toBe('Ten');
  expect(equationSubmission("I don't understand ten", 'What is x?')).toBe("I don't understand ten");
});


it('does not grade mixed arithmetic with guessed precedence', () => {
  expect(checkFractionItem(20, 'two plus three times four')).toBeNull();
});


it('never turns a false arithmetic claim into a verified value of x', () => {
  expect(equationSubmission('two plus two makes ten', 'What is the value of x?')).toBe('two plus two makes ten');
});

describe('varied learner utterances', () => {
  it.each([
    ['twelve', true], ['12', true], ['the answer is twelve', true],
    ['three times four', true], ['three times four makes twelve', true],
    ['I think 3 * 4 gives us 12', true], ['four plus four plus four is twelve', true],
    ['thirteen', false], ['eleven', false], ['three times four makes thirteen', false],
    ['I think 3 * 4 gives us 13', false], ['two plus two makes twelve', false],
    ['I do not understand three times four', null], ['Is three times four twelve?', null],
    ['What is three times four?', null], ['Could you explain twelve?', null],
    ['maybe twelve or thirteen', null], ['I need more time', null],
    ['What do you expect me to do?', null], ['Please give me a hint', null],
    ['I am lost', null], ['I want another example with twelve', null],
    ['twelve?', null], ['Can I say twelve?', null],
  ] as const)('checks "%s" without guessing intent', (utterance, expected) => {
    expect(checkFractionItem(12, utterance)).toBe(expected);
  });
});
