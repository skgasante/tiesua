import { describe, expect, it } from 'vitest';
import { parseExpression } from '../math/parser';
import { planText, toSpeechPlan } from '../speech/speechPlan';
import { PROBLEMS } from './problems';

describe('problem bank integrity', () => {
  it('has at least six varied problems with unique ids', () => {
    expect(PROBLEMS.length).toBeGreaterThanOrEqual(6);
    expect(new Set(PROBLEMS.map((p) => p.id)).size).toBe(PROBLEMS.length);
  });

  for (const problem of PROBLEMS) {
    it(`${problem.id}: parses, speaks naturally, and declares solution and path`, () => {
      const node = parseExpression(problem.expression);
      expect(node.kind).toBe('equation');
      const spoken = planText(toSpeechPlan(node, 'natural'));
      expect(spoken.length).toBeGreaterThan(5);
      // Natural mode never uses the verbose Detailed narration.
      expect(spoken).not.toContain('numerator');
      expect(problem.solution).toMatch(/^x = /);
      expect(problem.validPath.length).toBeGreaterThanOrEqual(2);
      expect(problem.misconceptions.length).toBeGreaterThanOrEqual(1);
    });
  }

  it('grouped numerators keep the "all over" convention', () => {
    const grouped = PROBLEMS.filter((p) => p.expression.startsWith('(x'));
    expect(grouped.length).toBeGreaterThanOrEqual(2);
    for (const p of grouped) {
      expect(planText(toSpeechPlan(parseExpression(p.expression), 'natural'))).toContain('all over');
    }
  });
});
