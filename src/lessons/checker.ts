/** Communicative purpose must be established before extracting quantities. */
export function isLearnerQuestion(raw: string): boolean {
  if (/\b(?:i (?:was |am )?asking|i asked|my question is|whether|wondering if)\b/i.test(raw)) return true;
  return /\?\s*$/.test(raw) || /^(?:why|how|what|when|where|is|are|does|do|can|could|would|should)\b/i.test(raw.trim()) || /\b(?:don.t understand|do not understand|confused|help me|explain|say .* again|repeat|hint)\b/i.test(raw);
}

/** Deterministic checking for curated practice answers.
 * Answers may be spoken naturally: "12", "twelve", or a full
 * verbal calculation - "Three times four makes twelve",
 * "Four plus four plus four is twelve." A verbal calculation is
 * understood as the arithmetic it states (deterministically, never
 * by model confidence), and its result is the answer. No clear
 * number or calculation means we cannot judge - the caller asks
 * again instead of guessing. This is parsing, not verification of
 * the learner's arithmetic claim: a wrong claim ("three times
 * four makes thirteen") yields its claimed result and is judged
 * wrong against the expected answer. */

const WORDS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18,
  nineteen: 19, twenty: 20,
};

const NUM_TOKEN = '(\\d{1,3}|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty)';
const OP_TOKEN = '(times|multiplied by|plus|minus|divided by|\\+|-|\\*|/)';

function tokenValue(tok: string): number {
  return /^\d+$/.test(tok) ? Number(tok) : WORDS[tok];
}

function applyOp(a: number, op: string, b: number): number | null {
  switch (op) {
    case 'times': case 'multiplied by': case '*': return a * b;
    case 'plus': case '+': return a + b;
    case 'minus': case '-': return a - b;
    case 'divided by': case '/': return b === 0 ? null : a / b;
    default: return null;
  }
}

const OP_SYMBOL: Record<string, string> = {
  times: '×', 'multiplied by': '×', '*': '×', plus: '+', '+': '+',
  minus: '−', '-': '−', 'divided by': '÷', '/': '÷',
};

export interface NumericInterpretation {
  /** The result the utterance expresses (its claimed result). */
  value: number;
  arithmeticCorrect?: boolean;
  /** Human-readable form, e.g. "3 × 4 = 12", for transcripts. */
  description: string;
}

/** Interpret a numeric answer, including verbal calculations.
 * Returns null when no single result is expressed. */
export function interpretNumericAnswer(raw: string): NumericInterpretation | null {
  if (isLearnerQuestion(raw)) return null;
  const t = raw.toLowerCase().replace(/\s+/g, ' ').trim()
    .replace(/^(?:i think|i believe|i guess)\s+/, '')
    .replace(/\bgives us\b/g, 'gives');
  const numberText = t.replace(/^(?:the answer is|it is|it's|x equals(?: to)?|x is|the denominator is|the numerator is|each (?:friend |child )?(?:gets|has)|they (?:get|have)|i (?:gave|have given)(?: away)?)\s+/, '')
    .replace(/[.!]+$/, '').replace(/\s+(?:sweets?|pieces?|friends?|children|groups?)(?:\s+(?:each|altogether|in all))?$/, '')
    .replace(/\s+(?:each|altogether|in all)$/, '');
  const signed = numberText.match(/^(negative |minus |-)?(one hundred|\d+(?:\.\d+)?|[a-z]+)$/);
  if (signed) {
    const n = signed[2] === 'one hundred' ? 100 : /^\d/.test(signed[2]) ? Number(signed[2]) : WORDS[signed[2]];
    if (n !== undefined && Number.isFinite(n)) return { value: signed[1] ? -n : n, description: String(signed[1] ? -n : n) };
  }

  // Verbal calculation: NUM (op NUM)+ [makes|is|equals|gives|= NUM]
  const calc = new RegExp(
    `^${NUM_TOKEN}((?:\\s+${OP_TOKEN}\\s+${NUM_TOKEN})+)(?:\\s+(?:makes|is|equals|gives|=)\\s+${NUM_TOKEN})?\\.?$`,
  );
  const m = t.match(calc);
  if (m) {
    const first = tokenValue(m[1]);
    const chainText = m[2];
    // Re-tokenise the chain deterministically.
    const chainRe = new RegExp(`\\s+${OP_TOKEN}\\s+${NUM_TOKEN}`, 'g');
    let computed: number | null = first;
    let desc = String(first);
    let cm: RegExpExecArray | null;
    let valid = true;
    let operationFamily: 'sum' | 'product' | undefined;
    while ((cm = chainRe.exec(chainText)) !== null) {
      const op = cm[1];
      const family = ['plus', 'minus', '+', '-'].includes(op) ? 'sum' : 'product';
      // Mixed operations need an explicit structured parse with precedence.
      // Do not grade a guessed left-to-right calculation.
      if (operationFamily && operationFamily !== family) return null;
      operationFamily = family;
      const operandTok = cm[0].trim().split(/\s+/).pop()!;
      const operand = tokenValue(operandTok);
      if (computed === null) { valid = false; break; }
      computed = applyOp(computed, op, operand);
      desc += ` ${OP_SYMBOL[op] ?? op} ${operand}`;
    }
    if (valid && computed !== null) {
      // A stated result after the calculation is the expressed answer.
      const resultMatch = m[0].match(new RegExp(`(?:makes|is|equals|gives|=)\\s+${NUM_TOKEN}\\s*\\.?$`));
      if (resultMatch) {
        const result = tokenValue(resultMatch[1]);
        return { value: result, description: `${desc} = ${result}`, ...(result !== computed ? { arithmeticCorrect: false } : {}) };
      }
      return { value: computed, description: `${desc} = ${computed}` };
    }
  }

  return null;
}

export function extractNumber(text: string): number | null {
  return interpretNumericAnswer(text)?.value ?? null;
}

/** true = correct, false = a result was expressed but wrong,
 * null = no clear result understood (ask again, do not judge). */
export function checkFractionItem(expected: number, text: string): boolean | null {
  const found = interpretNumericAnswer(text);
  if (found === null) return null;
  return found.arithmeticCorrect !== false && found.value === expected;
}


/** A bare number is a value of x only when that was explicitly requested. */
export function equationSubmission(text: string, currentQuestion: string): string {
  const answer = interpretNumericAnswer(text);
  if (answer && answer.arithmeticCorrect !== false && /(?:what is|what's|find|tell me|give me)(?: the)?(?: value of)? x\b|what does x equal/i.test(currentQuestion)) {
    return `x = ${answer.value}`;
  }
  return text;
}
