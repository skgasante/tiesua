import { parseExpression } from '../math/parser';
import type { VerifiedState } from './api';

/** Display only an operation already accepted by the independent verifier.
 * Do not simplify it or replace the authoritative equation with this view. */
export function workingDisplay(state: Pick<VerifiedState, 'equation_text' | 'pending_operation'>): string {
  const operation = state.pending_operation?.match(/^(multiply|divide|add|subtract) both sides by (.+)$/);
  const sides = state.equation_text.split('=');
  if (!operation || sides.length !== 2) return state.equation_text;
  const symbol = { multiply: '*', divide: '/', add: '+', subtract: '-' }[operation[1]];
  const expression = sides.map(side => `(${side.trim()})${symbol}(${operation[2]})`).join(' = ');
  try { parseExpression(expression); return expression; } catch { return state.equation_text; }
}
