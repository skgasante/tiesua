import { describe, expect, it } from 'vitest';
import { parseExpression, ParseError } from './parser';
import { signature } from './ast';

describe('parser: structural distinctions', () => {
  it('distinguishes (x+2)/4 from x+(2/4)', () => {
    const a = parseExpression('(x+2)/4');
    const b = parseExpression('x+(2/4)');
    expect(signature(a)).not.toBe(signature(b));
    // (x+2)/4: the sum is the numerator of the fraction.
    expect(a.kind).toBe('binary');
    if (a.kind === 'binary') { expect(a.op).toBe('/'); expect(signature(a.left)).toContain('grp'); }
    // x+(2/4): the fraction is the second term of a sum.
    expect(b.kind).toBe('binary');
    if (b.kind === 'binary') { expect(b.op).toBe('+'); }
  });

  it('preserves explicit brackets as group nodes', () => {
    const n = parseExpression('3(x+2)');
    expect(signature(n)).toContain('grp');
  });

  it('parses implicit multiplication 3(x+2) and 2x as products', () => {
    const a = parseExpression('3(x+2)');
    expect(a.kind === 'binary' && a.op).toBe('*');
    const b = parseExpression('2x');
    expect(signature(b)).toBe('(num(2)*var(x))');
  });

  it('parses negative groups x-(-3)', () => {
    const n = parseExpression('x-(-3)');
    expect(n.kind === 'binary' && n.op).toBe('-');
    expect(signature(n)).toContain('neg');
  });

  it('parses the demo equation (x+2)/4 = 3', () => {
    const n = parseExpression('(x+2)/4 = 3');
    expect(n.kind).toBe('equation');
  });

  it('normalises unicode operators', () => {
    expect(signature(parseExpression('x×2'))).toBe(signature(parseExpression('x*2')));
  });

  it('rejects unclosed brackets with a repairable error', () => {
    expect(() => parseExpression('(x+2')).toThrow(ParseError);
    expect(() => parseExpression('(x+2')).toThrow(/bracket/i);
  });

  it('rejects unknown symbols and double equals', () => {
    expect(() => parseExpression('x @ 2')).toThrow(ParseError);
    expect(() => parseExpression('x = 1 = 2')).toThrow(ParseError);
  });

  it('rejects empty input', () => {
    expect(() => parseExpression('   ')).toThrow(ParseError);
  });
});
