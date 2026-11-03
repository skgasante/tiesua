/** Progressive silence follow-ups (deterministic, no model calls).
 *
 * Intervals are the waits BETWEEN successive gentle follow-ups.
 * Reminders pause for TieSua's own speech and for processing, and
 * for push-to-talk listening (the learner deliberately pressed
 * Talk). They do NOT pause merely because a hands-free microphone
 * is capturing: in hands-free mode capture can be continuous, so
 * what pauses a reminder is actual detected learner speech
 * (recognition results or a voice-activity onset), tracked by the
 * caller through `msSinceSpeech`. */

export const SILENCE_INTERVALS_SECONDS = [45, 30, 45, 60, 90];

export const SILENCE_FOLLOW_UPS = [
  'Take your time. I am here.',
  'Would you like a hint? We can work it out together.',
  'Are you still there? No rush at all.',
  'We can do this one small step at a time.',
  'I will wait quietly now. Speak or type whenever you are ready.',
];

export interface SilenceConditions {
  awaitingResponse: boolean;
  speaking: boolean;
  busy: boolean;
  listening: boolean;
  handsFree: boolean;
}

/** Should a silence reminder be armed under these conditions? */
export function silenceArmed(c: SilenceConditions): boolean {
  if (!c.awaitingResponse || c.speaking || c.busy) return false;
  // Push-to-talk capture means the learner is actively responding.
  // Hands-free capture alone does not - the learner may be silent.
  if (c.listening && !c.handsFree) return false;
  return true;
}

/** Speech within this window counts as "learner is responding". */
export const SPEECH_RECENCY_MS = 4000;

export function speechIsRecent(msSinceSpeech: number): boolean {
  return msSinceSpeech < SPEECH_RECENCY_MS;
}

/** Follow-up text for a step, or null when the sequence is over
 * and TieSua should wait quietly. */
export function followUpForStep(step: number): string | null {
  return SILENCE_FOLLOW_UPS[step] ?? null;
}
