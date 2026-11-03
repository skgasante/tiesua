import { expect, it } from 'vitest';
import { workingDisplay } from './workingDisplay';
import { PROBLEMS } from './problems';
import { parseExpression } from '../math/parser';

it.each(PROBLEMS)('renders each arithmetic operation on BOTH sides of $id without simplifying', problem => {
  for (const [operation, symbol] of [['multiply', '*'], ['divide', '/'], ['add', '+'], ['subtract', '-']]) {
    const state = { equation_text: problem.expression, pending_operation: `${operation} both sides by 4` };
    const view = workingDisplay(state);
    expect(() => parseExpression(view)).not.toThrow();
    const sides = problem.expression.split('=');
    expect(view).toBe(`(${sides[0].trim()})${symbol}(4) = (${sides[1].trim()})${symbol}(4)`);
    expect(state.equation_text).toBe(problem.expression);
  }
});

it('returns to the verified result once no operation is pending', () => {
  expect(workingDisplay({ equation_text: 'x + 2 = 12', pending_operation: null })).toBe('x + 2 = 12');
});
