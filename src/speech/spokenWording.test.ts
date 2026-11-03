import { describe, expect, it } from 'vitest';
import { spokenWording } from './spokenWording';

describe('spoken wording', () => {
  it('removes the product name from introductions and model replies', () => {
    expect(spokenWording('I am TieSua. Ask TieSua about this.')).toBe('I am your tutor. Ask this app about this.');
    expect(spokenWording('TieSua’s voice is ready.')).toBe("the app's voice is ready.");
  });
  it('leaves mathematical phrases unchanged', () => {
    expect(spokenWording('x plus two, all over four, equals three')).toBe('x plus two, all over four, equals three');
  });
});
