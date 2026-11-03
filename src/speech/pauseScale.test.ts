// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseExpression } from '../math/parser';
import { toSpeechPlan } from './speechPlan';
import { applyPauseScale, renderUtterances } from './render';
import { BrowserSpeechProvider } from './provider';

const rendered = (expression: string) => renderUtterances(toSpeechPlan(parseExpression(expression), 'natural'));
const spokenWords = (parts: { text: string }[]) => parts.map((p) => p.text).join(' ');

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('learner-selected grouping pauses', () => {
  it.each(['(x+2)/4', 'x+(2/4)', '(x+2)/4 = 3'])(
    'speaks %s in a single utterance at zero, without adding a new gap',
    (expression) => {
      const baseline = rendered(expression);
      const quiet = applyPauseScale(baseline, 0);
      expect(quiet).toHaveLength(1);
      expect(quiet[0].pauseAfterMs).toBe(0);
      expect(spokenWords(quiet)).toBe(spokenWords(baseline));
      expect(baseline.length).toBeGreaterThan(1);
    },
  );

  it('scales every planned gap to the user selection, not a fixed value', () => {
    const baseline = rendered('x+(2/4)');
    const originalPause = baseline[0].pauseAfterMs;
    expect(originalPause).toBeGreaterThan(0);
    for (const selection of [0.25, 0.5, 1, 1.5, 2]) {
      const scaled = applyPauseScale(baseline, selection);
      expect(scaled[0].pauseAfterMs).toBe(Math.round(originalPause * selection));
      expect(spokenWords(scaled)).toBe(spokenWords(baseline));
      expect(baseline[0].pauseAfterMs).toBe(originalPause);
    }
  });

  it('also scales grouping boundaries in the other fraction expression', () => {
    const baseline = rendered('(x+2)/4');
    const pause = baseline[0].pauseAfterMs;
    expect(pause).toBeGreaterThan(0);
    expect(applyPauseScale(baseline, 2)[0].pauseAfterMs).toBe(pause * 2);
    expect(applyPauseScale(baseline, 0.5)[0].pauseAfterMs).toBe(Math.round(pause * 0.5));
  });

  it('does not restart native browser speech at zero pause', () => {
    vi.useFakeTimers();
    const spoken: any[] = [];
    const cancel = vi.fn();
    vi.stubGlobal('SpeechSynthesisUtterance', class {
      constructor(public text: string) {}
    });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        cancel,
        getVoices: () => [],
        speak: (utterance: any) => { spoken.push(utterance); utterance.onstart?.(); },
      },
    });
    const provider = new BrowserSpeechProvider();
    provider.speak(toSpeechPlan(parseExpression('(x+2)/4'), 'natural'), { pauseScale: 0 });
    vi.advanceTimersByTime(100);
    expect(spoken).toHaveLength(1);
    expect(spoken[0].text).toBe('x plus two all over four');
    spoken[0].onend();
    vi.advanceTimersByTime(1000);
    expect(spoken).toHaveLength(1);
    provider.stop();
  });
});
