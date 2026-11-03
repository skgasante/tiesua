import { describe, expect, it } from 'vitest';
import { SILENCE_INTERVALS_SECONDS, followUpForStep, silenceArmed, speechIsRecent } from './silence';

describe('progressive silence behaviour', () => {
  it('uses the more patient 45/30/45/60/90 progression, then quiet', () => {
    expect(SILENCE_INTERVALS_SECONDS).toEqual([45, 30, 45, 60, 90]);
    expect(followUpForStep(0)).toContain('Take your time');
    expect(followUpForStep(4)).toContain('wait quietly');
    expect(followUpForStep(5)).toBeNull();
  });

  it('hands-free capture being active does NOT pause reminders', () => {
    // The owner-reported defect: continuous hands-free listening
    // must not suppress the waiting sequence when the learner is
    // simply silent.
    expect(silenceArmed({ awaitingResponse: true, speaking: false, busy: false, listening: true, handsFree: true })).toBe(true);
  });

  it('pauses for TieSua speech, processing, and push-to-talk capture', () => {
    expect(silenceArmed({ awaitingResponse: true, speaking: true, busy: false, listening: false, handsFree: true })).toBe(false);
    expect(silenceArmed({ awaitingResponse: true, speaking: false, busy: true, listening: false, handsFree: true })).toBe(false);
    expect(silenceArmed({ awaitingResponse: true, speaking: false, busy: false, listening: true, handsFree: false })).toBe(false);
    expect(silenceArmed({ awaitingResponse: false, speaking: false, busy: false, listening: false, handsFree: true })).toBe(false);
  });

  it('actual detected speech counts as responding', () => {
    expect(speechIsRecent(500)).toBe(true);
    expect(speechIsRecent(30_000)).toBe(false);
  });
});
