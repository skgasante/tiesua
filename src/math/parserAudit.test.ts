import { describe, expect, it } from 'vitest';
import vectors from '../../tests/parser-vectors.json';
import { parseExpression } from './parser';
import { signature, type MathNode } from './ast';

/** Cross-language parser audit (frontend side). Expected values in
 * tests/parser-vectors.json were hand-computed independently of
 * either parser. Evaluation here uses exact BigInt rationals. */

type Frac = [bigint, bigint];
const frac = (n: bigint, d: bigint = 1n): Frac => {
  if (d < 0n) { n = -n; d = -d; }
  let a = n < 0n ? -n : n; let b = d;
  while (b !== 0n) { const t = a % b; a = b; b = t; }
  const g = a === 0n ? 1n : a;
  return [n / g, d / g];
};
const add = (a: Frac, b: Frac): Frac => frac(a[0] * b[1] + b[0] * a[1], a[1] * b[1]);
const mul = (a: Frac, b: Frac): Frac => frac(a[0] * b[0], a[1] * b[1]);
const div = (a: Frac, b: Frac): Frac => frac(a[0] * b[1], a[1] * b[0]);
const pow = (a: Frac, e: Frac): Frac => {
  const exp = Number(e[0] / e[1]);
  if (a[0] === 0n && exp < 0) throw new Error('undefined: zero to a negative power');
  return exp >= 0 ? frac(a[0] ** BigInt(exp), a[1] ** BigInt(exp)) : frac(a[1] ** BigInt(-exp), a[0] ** BigInt(-exp));
};
const parseNum = (raw: string): Frac => {
  if (!raw.includes('.')) return frac(BigInt(raw));
  const [w, f] = raw.split('.');
  return frac(BigInt(w + f), 10n ** BigInt(f.length));
};

function evaluate(node: MathNode, x: Frac): Frac {
  switch (node.kind) {
    case 'number': return parseNum(node.value);
    case 'variable': return x;
    case 'group': return evaluate(node.expr, x);
    case 'unary': { const v = evaluate(node.expr, x); return frac(-v[0], v[1]); }
    case 'equation': throw new Error('equation has no single value');
    case 'binary': {
      const l = evaluate(node.left, x); const r = evaluate(node.right, x);
      if (node.op === '+') return add(l, r);
      if (node.op === '-') return add(l, frac(-r[0], r[1]));
      if (node.op === '*') return mul(l, r);
      if (node.op === '/') {
        if (r[0] === 0n) throw new Error('undefined: division by zero at this point');
        return div(l, r);
      }
      return pow(l, r);
    }
  }
}

const parseRational = (raw: string): Frac => {
  if (!raw.includes('/')) return parseNum(raw);
  const [n, d] = raw.split('/');
  return frac(BigInt(n), BigInt(d));
};

describe('parser audit vectors (frontend)', () => {
  for (const v of vectors.vectors) {
    it(v.expr, () => {
      const node = parseExpression(v.expr);
      if (v.frontendSignature) expect(signature(node)).toBe(v.frontendSignature);
      for (const [point, expected] of Object.entries(v.evaluations)) {
        const x = parseRational(point);
        if (expected === 'undefined') {
          expect(() => evaluate(node, x), `${v.expr} at x=${point}`).toThrow(/undefined/);
        } else {
          const [n, d] = evaluate(node, x);
          const [en, ed] = parseRational(expected);
          expect(`${n}/${d}`, `${v.expr} at x=${point}`).toBe(`${en}/${ed}`);
        }
      }
    });
  }
});
