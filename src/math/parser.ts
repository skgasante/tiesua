import type { BinaryOp, MathNode } from './ast';

/** Controlled input grammar for TieSua (Junior High scope):
 * numbers, one-letter unknowns, + - * / ^, parentheses, one '=' for
 * equations, and implicit multiplication (2x, 3(x+2)). Input is only
 * ever tokenised and parsed into the AST — never evaluated as code.
 * A later stage converts validated ASTs into SymPy objects. */

export class ParseError extends Error {
  readonly position: number;
  constructor(message: string, position: number) {
    super(message);
    this.name = 'ParseError';
    this.position = position;
  }
}

type Token =
  | { type: 'number'; value: string; pos: number }
  | { type: 'variable'; value: string; pos: number }
  | { type: 'op'; value: BinaryOp | '=' | '(' | ')'; pos: number };

const NORMALISE: Record<string, string> = {
  '×': '*', '✕': '*', '÷': '/', '−': '-', '–': '-', '—': '-', '＝': '=',
};

export function tokenize(input: string): Token[] {
  const src = [...input].map((c) => NORMALISE[c] ?? c).join('');
  const tokens: Token[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] ?? ''))) {
      let j = i;
      let dots = 0;
      while (j < src.length && (/[0-9]/.test(src[j]) || src[j] === '.')) {
        if (src[j] === '.') dots++;
        j++;
      }
      if (dots > 1) throw new ParseError('That number has more than one decimal point. Try writing it again.', i);
      tokens.push({ type: 'number', value: src.slice(i, j), pos: i });
      i = j; continue;
    }
    if (/[a-zA-Z]/.test(c)) { tokens.push({ type: 'variable', value: c.toLowerCase(), pos: i }); i++; continue; }
    if ('+-*/^=()'.includes(c)) { tokens.push({ type: 'op', value: c as BinaryOp | '=' | '(' | ')', pos: i }); i++; continue; }
    throw new ParseError(`I don't recognise the symbol “${c}”. You can use numbers, x, plus, minus, times, divide, powers and brackets.`, i);
  }
  return tokens;
}

let counter = 0;
const nid = () => `n${++counter}`;

class Parser {
  private pos = 0;
  constructor(private tokens: Token[]) {}

  private peek(): Token | undefined { return this.tokens[this.pos]; }
  private next(): Token { const t = this.tokens[this.pos++]; if (!t) throw new ParseError('The expression ended unexpectedly. Try writing the whole expression again.', 0); return t; }
  private atOp(v: string): boolean { const t = this.peek(); return !!t && t.type === 'op' && t.value === v; }

  parseTop(): MathNode {
    if (this.tokens.length === 0) throw new ParseError('Nothing to read yet. Write or say a mathematical expression first.', 0);
    counter = 0;
    const left = this.parseAddSub();
    let node: MathNode = left;
    if (this.atOp('=')) {
      this.next();
      const right = this.parseAddSub();
      node = { kind: 'equation', id: nid(), left, right };
    }
    const rest = this.peek();
    if (rest) throw new ParseError('I found something extra after the end of the expression. Check for repeated symbols or a second equals sign.', rest.pos);
    return node;
  }

  private parseAddSub(): MathNode {
    let left = this.parseMulDiv();
    while (this.atOp('+') || this.atOp('-')) {
      const op = (this.next() as { value: BinaryOp }).value;
      const right = this.parseMulDiv();
      left = { kind: 'binary', id: nid(), op, left, right };
    }
    return left;
  }

  private startsAtom(t: Token | undefined): boolean {
    return !!t && (t.type === 'number' || t.type === 'variable' || (t.type === 'op' && t.value === '('));
  }

  private parseMulDiv(): MathNode {
    let left = this.parsePower();
    for (;;) {
      if (this.atOp('*') || this.atOp('/')) {
        const op = (this.next() as { value: BinaryOp }).value;
        const right = this.parsePower();
        left = { kind: 'binary', id: nid(), op, left, right };
      } else if (this.startsAtom(this.peek())) {
        // Implicit multiplication: 2x, 3(x+2), (x+1)(x+2)
        const right = this.parsePower();
        left = { kind: 'binary', id: nid(), op: '*', left, right, implicit: true };
      } else break;
    }
    return left;
  }

  private parsePower(): MathNode {
    const base = this.parseUnary();
    if (this.atOp('^')) {
      this.next();
      const exp = this.parsePower();
      return { kind: 'binary', id: nid(), op: '^', left: base, right: exp };
    }
    return base;
  }

  private parseUnary(): MathNode {
    if (this.atOp('-')) { this.next(); return { kind: 'unary', id: nid(), op: '-', expr: this.parseUnary() }; }
    if (this.atOp('+')) { this.next(); return this.parseUnary(); }
    return this.parseAtom();
  }

  private parseAtom(): MathNode {
    const t = this.next();
    if (t.type === 'number') return { kind: 'number', id: nid(), value: t.value };
    if (t.type === 'variable') return { kind: 'variable', id: nid(), name: t.value };
    if (t.type === 'op' && t.value === '(') {
      const inner = this.parseAddSub();
      if (!this.atOp(')')) throw new ParseError('A bracket was opened but not closed. Check that every open bracket has a close bracket.', t.pos);
      this.next();
      return { kind: 'group', id: nid(), expr: inner };
    }
    throw new ParseError('I expected a number, x, or an open bracket there. Try writing the expression again.', t.pos);
  }
}

export function parseExpression(input: string): MathNode {
  return new Parser(tokenize(input)).parseTop();
}
