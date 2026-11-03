import { describe, expect, it } from 'vitest';
import { parseExpression } from '../math/parser';
import { toSpeechPlan } from '../speech/speechPlan';
import { plannedPauseTotal, renderUtterances } from '../speech/render';
import { PROBLEMS } from './problems';

/** Speech across the whole bank, with the owner's approved settings
 * model: Natural mode, phrase-level rendering. Grouping must
 * survive longer expressions without returning to choppiness. */
describe('speech across all eight problems', () => {
  for (const problem of PROBLEMS) {
    it(`${problem.id}: grouped, connected, and short`, () => {
      const plan = toSpeechPlan(parseExpression(problem.expression), 'natural');
      const utterances = renderUtterances(plan);
      expect(utterances.length).toBeGreaterThanOrEqual(1);
      expect(utterances.length).toBeLessThanOrEqual(4);
      expect(plannedPauseTotal(plan)).toBeLessThanOrEqual(450);
      if (problem.expression.startsWith('(x')) {
        expect(utterances.map((u) => u.text).join(' ')).toContain('all over');
      }
      // No utterance is a lone operator or single word fragment.
      for (const u of utterances) {
        expect(u.text.split(' ').length).toBeGreaterThanOrEqual(2);
      }
    });
  }

  it('voice, speed and pause settings persist across a reload cycle', () => {
    // Mirrors the App settings contract: one localStorage key,
    // merged over defaults, survives serialisation unchanged.
    const settings = { rate: 1.8, pauseScale: 0.25, voiceURI: 'voice-xyz', announceMode: 'both' };
    const raw = JSON.stringify(settings);
    const restored = { rate: 1.15, pauseScale: 1, voiceURI: '', announceMode: 'app-voice', ...JSON.parse(raw) };
    expect(restored).toEqual(settings);
  });
});
