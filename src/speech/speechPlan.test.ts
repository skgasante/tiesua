import { describe, expect, it } from 'vitest';
import { parseExpression } from '../math/parser';
import { exploreParts, planText, toSpeechPlan } from './speechPlan';

const say = (expr: string, mode: 'ordinary' | 'natural' | 'detailed') =>
  planText(toSpeechPlan(parseExpression(expr), mode));

describe('structured speech: approved Natural conventions', () => {
  it('(x+2)/4 reads "x plus two, all over four"', () => {
    expect(say('(x+2)/4', 'natural')).toBe('x plus two all over four');
  });
  it('x+(2/4) reads "x, plus two over four"', () => {
    expect(say('x+(2/4)', 'natural')).toBe('x plus two over four');
  });
  it('3(x+2) keeps its brackets in Natural mode', () => {
    expect(say('3(x+2)', 'natural')).toBe('three times open bracket x plus two close bracket');
  });
  it('x-(-3) reads "x minus negative three"', () => {
    expect(say('x-(-3)', 'natural')).toBe('x minus negative three');
  });
  it('Natural readings of the demo pair differ', () => {
    expect(say('(x+2)/4', 'natural')).not.toBe(say('x+(2/4)', 'natural'));
  });
});

describe('structured speech: Ordinary mode demonstrates ambiguity', () => {
  it('both demo expressions collapse to the same flat reading', () => {
    expect(say('(x+2)/4', 'ordinary')).toBe('x plus two over four');
    expect(say('x+(2/4)', 'ordinary')).toBe('x plus two over four');
    expect(say('(x+2)/4', 'ordinary')).toBe(say('x+(2/4)', 'ordinary'));
  });
  it('Ordinary mode carries no grouping pauses', () => {
    const plan = toSpeechPlan(parseExpression('(x+2)/4'), 'ordinary');
    expect(plan.segments.every((s) => s.pauseAfterMs === 0)).toBe(true);
  });
});

describe('structured speech: Detailed mode makes grouping explicit', () => {
  it('names numerator and denominator for (x+2)/4', () => {
    const t = say('(x+2)/4', 'detailed');
    expect(t).toContain('numerator');
    expect(t).toContain('denominator');
    expect(t).toContain('x plus two');
  });
  it('Detailed differs from Natural for the same expression', () => {
    expect(say('(x+2)/4', 'detailed')).not.toBe(say('(x+2)/4', 'natural'));
  });
  it('Detailed names equation sides', () => {
    const t = say('(x+2)/4 = 3', 'detailed');
    expect(t).toContain('left side');
    expect(t).toContain('right side');
  });
});

describe('Speech Plan integrity', () => {
  it('every segment references a real AST node and keeps its pause', () => {
    const ast = parseExpression('(x+2)/4');
    const plan = toSpeechPlan(ast, 'natural');
    const ids = new Set<string>();
    const collect = (n: typeof ast): void => { ids.add(n.id); if ('left' in n) { collect(n.left); collect(n.right); } if ('expr' in n) collect(n.expr); };
    collect(ast);
    expect(plan.segments.length).toBeGreaterThan(1);
    for (const s of plan.segments) { expect(ids.has(s.nodeId)).toBe(true); expect(s.text.length).toBeGreaterThan(0); }
    // The fraction boundary carries the grouping pause.
    expect(plan.segments.some((s) => s.boundary === 'group' && s.pauseAfterMs >= 300)).toBe(true);
  });
  it('Natural equation reading includes equals with an equation pause', () => {
    const plan = toSpeechPlan(parseExpression('(x+2)/4 = 3'), 'natural');
    expect(planText(plan)).toContain('equals');
    expect(plan.segments.some((s) => s.boundary === 'equation')).toBe(true);
  });
});

describe('exploration by constituent parts', () => {
  it('splits (x+2)/4 into numerator and denominator parts', () => {
    const parts = exploreParts(parseExpression('(x+2)/4'));
    expect(parts.map((p) => p.label).join(' ')).toMatch(/numerator/i);
    expect(parts.map((p) => planText(p.plan))).toContain('x plus two');
  });
  it('splits the demo equation into left and right sides', () => {
    const parts = exploreParts(parseExpression('(x+2)/4 = 3'));
    expect(parts).toHaveLength(2);
  });
});
