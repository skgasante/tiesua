export const FRACTION_DIVISION_INTRODUCTION = 'We can write that same division another way. A fraction is another way to write division. On the left hand side, twelve over four means twelve divided by four. Twelve is above the line and four is below. The line means divided by. The right hand side stays three. What does twelve over four mean?';

/** A positional description alone does not teach the change of notation. */
export function hasDivisionFractionBridge(text: string): boolean {
  return /fraction[^.!?]*(?:way|represent|writ|notation)[^.!?]*division/i.test(text)
    && /line[^.!?]*(?:means?|represents?)[^.!?]*(?:divid|division)/i.test(text)
    && /left hand side/i.test(text) && /right hand side/i.test(text)
    && /(?:above|numerator)/i.test(text) && /(?:below|denominator)/i.test(text)
    && text.trim().endsWith('?');
}

export function checkedFractionIntroduction(text: string): string {
  return hasDivisionFractionBridge(text) ? text : FRACTION_DIVISION_INTRODUCTION;
}
