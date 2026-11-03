/** Filter only metadata the browser actually supplies; unknown gender is not guessed. */
export function voiceCandidates<T extends {name: string; lang: string}>(voices: T[], descriptor = ''): T[] {
  const english = voices.filter(v => /^en(?:[-_]|$)/i.test(v.lang));
  let pool = english.length ? english : voices;
  if (/\b(?:male|man|man's|men)\b/i.test(descriptor)) pool = pool.filter(v => /\bmale\b|\b(?:david|mark|george|daniel|james|guy|ryan)\b/i.test(v.name) && !/female/i.test(v.name));
  else if (/female|woman|woman's/i.test(descriptor)) pool = pool.filter(v => /female|samantha|karen|zira|hazel|susan|aria|jenny|sonia/i.test(v.name));
  return [...pool.filter(v => /google/i.test(v.name)), ...pool.filter(v => !/google/i.test(v.name))];
}
