import { expect, it } from 'vitest';
import { preferredVoice } from './preferredVoice';
it('prefers the requested Google voice and respects English fallbacks', () => {
  const voices = [{ name: 'Google UK English Male', lang: 'en-GB' }, { name: 'Microsoft Zira', lang: 'en-US' }, { name: 'Google UK English Female', lang: 'en-GB' }];
  expect(preferredVoice(voices)).toBe(voices[2]);
  expect(preferredVoice(voices.slice(0, 2))).toBe(voices[1]);
  expect(preferredVoice([])).toBeUndefined();
});
