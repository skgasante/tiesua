import type { MathNode } from '../math/ast';

/** Structured mathematical speech engine.
 *
 * Pure function: AST -> SpeechPlan. A plan is data — segments carrying
 * the source node id, phrase text, boundary type and intended pause —
 * so browser TTS today, a local neural TTS (e.g. Kokoro, to be
 * evaluated) tomorrow, captions and unit tests all consume the same
 * plan without change.
 *
 * Modes:
 * - ordinary: flat left-to-right reading with no grouping cues. Exists
 *   to demonstrate ambiguity in "Hear the Difference".
 * - natural (default): concise mathematical speech using the approved
 *   TieSua conventions ("all over", short grouping pauses, brackets
 *   only where needed for products/negatives).
 * - detailed: grouping made fully explicit on request (fraction parts
 *   named, brackets always spoken).
 *
 * These are candidate accessibility conventions, not validated
 * comprehension findings: pauses support, but do not by themselves
 * guarantee, unambiguous comprehension.
 */

export type SpeechMode = 'ordinary' | 'natural' | 'detailed';
export type Boundary = 'none' | 'phrase' | 'group' | 'equation';

export interface SpeechSegment {
  id: string;
  nodeId: string;
  text: string;
  pauseAfterMs: number;
  boundary: Boundary;
}

export interface SpeechPlan {
  mode: SpeechMode;
  segments: SpeechSegment[];
}

export const PAUSES = { phrase: 200, group: 350, equation: 500 } as const;

const ONES = ['zero','one','two','three','four','five','six','seven','eight','nine','ten','eleven','twelve','thirteen','fourteen','fifteen','sixteen','seventeen','eighteen','nineteen'];
const TENS = ['','','twenty','thirty','forty','fifty','sixty','seventy','eighty','ninety'];

export function numberToWords(raw: string): string {
  if (raw.includes('.')) {
    const [whole, frac] = raw.split('.');
    return `${numberToWords(whole)} point ${[...frac].map((d) => ONES[Number(d)]).join(' ')}`;
  }
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 999) return raw;
  if (n < 20) return ONES[n];
  if (n < 100) { const r = n % 10; return r === 0 ? TENS[Math.floor(n / 10)] : `${TENS[Math.floor(n / 10)]}-${ONES[r]}`; }
  const r = n % 100;
  return r === 0 ? `${ONES[Math.floor(n / 100)]} hundred` : `${ONES[Math.floor(n / 100)]} hundred and ${numberToWords(String(r))}`;
}

let segCounter = 0;
function seg(nodeId: string, text: string, pauseAfterMs = 0, boundary: Boundary = 'none'): SpeechSegment {
  return { id: `s${++segCounter}`, nodeId, text, pauseAfterMs, boundary };
}
function withPause(segs: SpeechSegment[], ms: number, boundary: Boundary): SpeechSegment[] {
  if (segs.length === 0) return segs;
  const copy = [...segs];
  copy[copy.length - 1] = { ...copy[copy.length - 1], pauseAfterMs: ms, boundary };
  return copy;
}
const isComplex = (n: MathNode): boolean =>
  n.kind === 'binary' ? (n.op === '+' || n.op === '-') : n.kind === 'group' ? isComplex(n.expr) : n.kind === 'unary';
const unwrap = (n: MathNode): MathNode => (n.kind === 'group' ? n.expr : n);

function speak(node: MathNode, mode: SpeechMode): SpeechSegment[] {
  switch (node.kind) {
    case 'number': return [seg(node.id, numberToWords(node.value))];
    case 'variable': return [seg(node.id, node.name === 'x' ? 'x' : node.name)];
    case 'unary': {
      // x-(-3) style negatives and standalone negatives.
      const inner = unwrap(node.expr);
      if (mode === 'detailed' && node.expr.kind === 'group') {
        return [seg(node.id, 'negative'), ...bracketed(node.expr, mode)];
      }
      if (inner.kind === 'number' || inner.kind === 'variable') {
        return [seg(node.id, `negative ${speak(inner, mode)[0].text}`)];
      }
      return [seg(node.id, 'negative'), ...speak(node.expr, mode)];
    }
    case 'group': {
      if (mode === 'ordinary') return speak(node.expr, mode);
      if (mode === 'detailed') return bracketed(node, mode);
      // Natural: brackets are spoken where they carry meaning — as a
      // factor, a power base, or standalone. Inside fractions the
      // fraction rule itself carries the grouping (see below).
      return bracketed(node, mode);
    }
    case 'equation': {
      if (mode === 'detailed') {
        return [
          seg(node.id, 'left side'), ...withPause(speak(node.left, mode), PAUSES.equation, 'equation'),
          seg(node.id, 'equals'),
          seg(node.id, 'right side'), ...speak(node.right, mode),
        ];
      }
      const pause = mode === 'ordinary' ? 0 : PAUSES.equation;
      return [...withPause(speak(node.left, mode), pause, 'equation'), seg(node.id, 'equals'), ...speak(node.right, mode)];
    }
    case 'binary': return speakBinary(node, mode);
  }
}

function bracketed(group: Extract<MathNode, { kind: 'group' }>, mode: SpeechMode): SpeechSegment[] {
  return [seg(group.id, 'open bracket'), ...speak(group.expr, mode), seg(group.id, 'close bracket')];
}

function speakBinary(node: Extract<MathNode, { kind: 'binary' }>, mode: SpeechMode): SpeechSegment[] {
  const { op, left, right } = node;

  if (op === '/') {
    if (mode === 'ordinary') {
      return [...speak(left, mode), seg(node.id, 'over'), ...speak(right, mode)];
    }
    if (mode === 'detailed') {
      return [
        seg(node.id, 'the fraction'), seg(node.id, 'numerator'),
        ...withPause(speak(unwrap(left), mode), PAUSES.group, 'group'),
        seg(node.id, 'over denominator'),
        ...withPause(speak(unwrap(right), mode), PAUSES.group, 'group'),
        seg(node.id, 'end of fraction'),
      ];
    }
    // Natural: a grouped or compound top means "all over"; a simple
    // top keeps the short "over". (x+2)/4 vs 2/4.
    const top = speak(unwrap(left), mode);
    const bottom = speak(unwrap(right), mode);
    if (isComplex(left)) {
      return [...withPause(top, PAUSES.group, 'group'), seg(node.id, 'all over'), ...bottom];
    }
    return [...top, seg(node.id, 'over'), ...bottom];
  }

  if (op === '*') {
    if (mode === 'ordinary') return [...speak(left, mode), seg(node.id, 'times'), ...speak(right, mode)];
    // 3(x+2): "three times open bracket x plus two close bracket"
    return [...speak(left, mode), seg(node.id, 'times'), ...speak(right, mode)];
  }

  if (op === '^') {
    if (mode === 'detailed') {
      return [seg(node.id, 'the quantity'), ...speak(left, mode), seg(node.id, 'raised to the power of'), ...speak(right, mode)];
    }
    return [...speak(left, mode), seg(node.id, 'to the power of'), ...speak(right, mode)];
  }

  // + and -
  if (op === '-' && mode === 'natural') {
    // x-(-3): "x minus negative three" — no bracket words needed,
    // the word "negative" carries the grouping.
    const r = unwrap(right);
    if ((right.kind === 'group' && r.kind === 'unary') || right.kind === 'unary') {
      const neg = r.kind === 'unary' ? r : null;
      if (neg) return [...withPause(speak(left, mode), PAUSES.phrase, 'phrase'), seg(node.id, 'minus'), ...speak(neg, mode)];
    }
  }
  if (op === '-' && mode === 'detailed') {
    const pause = PAUSES.phrase;
    return [...withPause(speak(left, mode), pause, 'phrase'), seg(node.id, 'minus'), ...speak(right, mode)];
  }
  const word = op === '+' ? 'plus' : 'minus';
  const pause = mode === 'ordinary' ? 0 : PAUSES.phrase;
  // Natural mode: brackets around a fraction as a term are not spoken —
  // "two over four" already carries its own grouping (x+(2/4)).
  const speakTerm = (n: MathNode): SpeechSegment[] =>
    mode === 'natural' && n.kind === 'group' && unwrap(n).kind === 'binary' && (unwrap(n) as { op?: string }).op === '/'
      ? speak(unwrap(n), mode)
      : speak(n, mode);
  return [...withPause(speakTerm(left), pause, 'phrase'), seg(node.id, word), ...speakTerm(right)];
}

export function toSpeechPlan(node: MathNode, mode: SpeechMode): SpeechPlan {
  segCounter = 0;
  return { mode, segments: speak(node, mode) };
}

/** Plain spoken text (pauses shown only in the plan, not the text). */
export function planText(plan: SpeechPlan): string {
  return plan.segments.map((s) => s.text).join(' ').replace(/\s+/g, ' ').trim();
}

export interface ExplorePart { label: string; nodeId: string; plan: SpeechPlan }

/** Constituent parts for step-through exploration, in reading order. */
export function exploreParts(node: MathNode, mode: SpeechMode = 'natural'): ExplorePart[] {
  const part = (label: string, n: MathNode): ExplorePart => ({ label, nodeId: n.id, plan: toSpeechPlan(n, mode) });
  const target = unwrap(node);
  if (node.kind === 'equation') return [part('Left side', node.left), part('Right side', node.right)];
  if (target.kind === 'binary' && target.op === '/') {
    return [part('Top of the fraction (numerator)', unwrap(target.left)), part('Bottom of the fraction (denominator)', unwrap(target.right))];
  }
  if (target.kind === 'binary' && (target.op === '+' || target.op === '-')) {
    return [part('First part', target.left), part('Second part', target.right)];
  }
  if (target.kind === 'binary' && target.op === '*') {
    return [part('First factor', target.left), part('Second factor', target.right)];
  }
  if (target.kind === 'binary' && target.op === '^') {
    return [part('Base', target.left), part('Power (exponent)', target.right)];
  }
  return [part('Whole expression', node)];
}
