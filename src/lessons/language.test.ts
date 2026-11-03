import { describe, expect, it } from 'vitest';
import { LESSONS } from './catalogue';

/** Child-friendly language guardrails for all predefined teaching
 * content. These check representative, mechanical properties only
 * (jargon, sentence length) - they do not prove teaching quality,
 * which needs human review of real outputs. */
const JARGON = [
  'verifier', 'verified exactly', 'solution set', 'extraneous', 'indeterminate',
  'registry', 'session', 'input', 'interface', 'parameter', 'algorithm', 'approximately equal',
];

function lessonStrings(): { lesson: string; where: string; text: string }[] {
  const out: { lesson: string; where: string; text: string }[] = [];
  for (const l of LESSONS) {
    const add = (where: string, texts: string[]) => texts.forEach((text) => out.push({ lesson: l.id, where, text }));
    add('objective', [l.objective]);
    add('intro', l.intro);
    add('example', l.example.explanation);
    add('example-step', (l.example.steps ?? []).map(step => step.explanation));
    add('simpler', l.simpler);
    add('recap', [l.recap]);
    for (const item of [...(l.guidedItems ?? []), ...(l.guidedExtraItems ?? []), ...(l.independentItems ?? [])]) {
      add('item-prompt', [item.prompt]);
      add('item-teach', [item.teach]);
    }
  }
  return out;
}

const SIGHT_DEPENDENT = [
  'watch the', 'watch this', 'look at', 'look above', 'look below', 'look inside',
  'see the', 'see this', 'as you can see', 'highlighted', 'watch carefully',
];

describe('nonvisual teaching language (core accessibility requirement)', () => {
  it('no predefined teaching text depends on seeing the screen', async () => {
    const { PREREQUISITES } = await import('./prerequisites');
    const strings = lessonStrings().map((s) => s.text);
    for (const p of Object.values(PREREQUISITES)) {
      strings.push(...p.explanation, ...p.simpler, p.check.prompt, p.check.teach);
    }
    for (const text of strings) {
      for (const phrase of SIGHT_DEPENDENT) {
        expect(text.toLowerCase(), `"${text}"`).not.toContain(phrase);
      }
    }
  });
  it('the worked example explains the whole grouped expression without requiring sight', () => {
    const eq = LESSONS.find((l) => l.id === 'equations-fraction')!;
    const joined = eq.example.steps!.map(step => step.explanation).join(' ');
    expect(joined).toContain('numerator above the line is the whole of x plus two');
    expect(joined).toContain('left hand side');
    expect(joined).toContain('right hand side');
    expect(joined).toContain('denominator below is four');
    expect(joined).toContain('both sides');
    expect(joined.toLowerCase()).not.toContain('watch');
  });
});

describe('child-friendly lesson language', () => {
  it('contains no developer or academic jargon', () => {
    for (const s of lessonStrings()) {
      for (const term of JARGON) {
        expect(s.text.toLowerCase(), `${s.lesson}/${s.where}: "${s.text}"`).not.toContain(term);
      }
    }
  });
  it('keeps every teaching sentence short (26 words or fewer)', () => {
    for (const s of lessonStrings()) {
      for (const sentence of s.text.split(/(?<=[.!?])\s+/)) {
        const words = sentence.split(/\s+/).filter(Boolean).length;
        expect(words, `${s.lesson}/${s.where}: "${sentence}"`).toBeLessThanOrEqual(26);
      }
    }
  });
  it('every lesson has an easier-words explanation', () => {
    for (const l of LESSONS) expect(l.simpler.length).toBeGreaterThanOrEqual(2);
  });
});

describe('learner-controlled depth', () => {
  // Depth requests ("explain that in easier words", "I understand
  // now") are meaningful conversation: the central orchestrator
  // decides them (explain-differently / continue moves), gated by
  // src/conversation/teachingMoves.ts. There is deliberately no
  // local phrase recogniser for them any more.
  it('every lesson still carries an easier-words explanation for the AI to use', () => {
    for (const l of LESSONS) expect(l.simpler.join(' ').length).toBeGreaterThan(40);
  });
});
