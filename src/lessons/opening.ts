/** Preserve the opening's teaching meaning while allowing the model to vary words. */
export function equationOpening(reply: string | undefined, brief: string): string {
  const text = reply?.trim() ?? '';
  const goal = /\b(?:missing|unknown|find|finding)\b/i.test(text)
    && /\b(?:number|value)\b/i.test(text)
    && /\bequations?\b/i.test(text) && /\bfractions?\b/i.test(text);
  const bridge = /\b(?:story|sweets)\b/i.test(text)
    && /\b(?:start|begin|first)\b/i.test(text);
  const prematureEquivalence = /\bequations?\s+(?:with|are|is|means?|using)\s+(?:equal\s+)?sharing\b/i.test(text)
    || /\bfraction[^.!?]*\blike sharing\b/i.test(text);
  return goal && bridge && !prematureEquivalence && text.endsWith('?') ? text : brief;
}
