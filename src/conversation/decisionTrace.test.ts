import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearTurnTraces, decisionTraceEnabled, getTurnTraces, previewInput,
  recordTurn, setDecisionTraceEnabled,
} from './decisionTrace';

const base = {
  screen: 'lesson' as const, lessonId: 'equations-fraction', stage: 'guided',
  interpretedBy: 'local' as const, metaCalled: false, decision: 'test',
  actionsExecuted: [] as string[], replyOrigin: 'templated' as const,
  verification: { involved: false }, nextStateChosenBy: 'local-rule' as const,
};

describe('decision trace (dev-only, privacy-conscious)', () => {
  beforeEach(() => { clearTurnTraces(); setDecisionTraceEnabled(null); });

  it('is disabled by default outside dev mode and records nothing', () => {
    // Vitest runs with MODE=test; the module must not record unless
    // explicitly enabled by the developer/owner on their own device.
    setDecisionTraceEnabled(false);
    expect(decisionTraceEnabled()).toBe(false);
    recordTurn({ ...base, ...previewInput('multiply both sides by four') });
    expect(getTurnTraces()).toHaveLength(0);
  });

  it('records who decided, whether Meta was called, and reply origin', () => {
    setDecisionTraceEnabled(true);
    recordTurn({
      ...base, ...previewInput('x plus two equals seven'),
      decision: 'tutor-feedback', interpretedBy: 'meta', metaCalled: true,
      replyOrigin: 'live-meta', verification: { involved: true, verdict: 'invalid', actionType: 'resulting_equation' },
      nextStateChosenBy: 'verifier',
    });
    const [t] = getTurnTraces();
    expect(t.metaCalled).toBe(true);
    expect(t.replyOrigin).toBe('live-meta');
    expect(t.verification.verdict).toBe('invalid');
    expect(t.nextStateChosenBy).toBe('verifier');
    expect(t.inputPreview).toBe('x plus two equals seven');
  });

  it('truncates learner input to a short preview, never a transcript', () => {
    const long = 'please explain '.repeat(20).trim();
    const { inputPreview, inputLength } = previewInput(long);
    expect(inputPreview.length).toBeLessThanOrEqual(60);
    expect(inputLength).toBe(long.length);
  });

  it('keeps only a bounded ring of recent turns', () => {
    setDecisionTraceEnabled(true);
    for (let i = 0; i < 60; i += 1) recordTurn({ ...base, ...previewInput(`turn ${i}`), decision: `d${i}` });
    const all = getTurnTraces();
    expect(all.length).toBe(50);
    expect(all[0].decision).toBe('d10');
  });

  it('returns copies so inspection cannot mutate stored traces', () => {
    setDecisionTraceEnabled(true);
    recordTurn({ ...base, ...previewInput('hint please'), actionsExecuted: ['lesson.hint'] });
    const copy = getTurnTraces();
    copy[0].actionsExecuted.push('nav.goHome');
    expect(getTurnTraces()[0].actionsExecuted).toEqual(['lesson.hint']);
  });

  it('clearing empties the trace (nothing persists anywhere)', () => {
    setDecisionTraceEnabled(true);
    recordTurn({ ...base, ...previewInput('stop') });
    clearTurnTraces();
    expect(getTurnTraces()).toHaveLength(0);
  });
});
