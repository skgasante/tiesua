export function preferredVoice<T extends { name: string; lang: string }>(voices: T[]): T | undefined {
  const english = voices.filter(v => /^en(?:[-_]|$)/i.test(v.lang));
  return english.find(v => /google uk english female/i.test(v.name))
    ?? english.find(v => !/\bmale\b/i.test(v.name) && /female|samantha|karen|moira|tessa|victoria|zira|hazel|susan|aria|jenny|sonia|natasha/i.test(v.name))
    ?? english[0];
}
