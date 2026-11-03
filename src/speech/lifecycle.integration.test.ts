import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BrowserSpeechProvider } from './provider';
import { ConversationSession, type RecognitionLike } from './conversationSession';
import { deriveContinuation, shouldAutoContinue } from '../conversation/turnContract';
import { SILENCE_INTERVALS_SECONDS, followUpForStep, silenceArmed } from '../lessons/silence';
import { getLifecycleEvents, setLifecycleLogEnabled, clearLifecycleEvents } from './lifecycleLog';
import type { SpeechPlan } from './speechPlan';

/** Integrated lifecycle test: REAL speech provider + REAL global
 * conversation session + REAL turn-contract, driven by a fake
 * synthesiser (controllable end events, including a dropped
 * utterance), a fake recogniser and virtual time. This replays
 * the owner's failed sequence: the worked-example explanation
 * ending "Every step kept the equation balanced." */

class FakeUtterance {
  text: string; rate = 1; volume = 1; pitch = 1; voice: unknown = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) { this.text = text; }
}

class FakeSynth {
  utterances: FakeUtterance[] = [];
  cancelled = 0;
  speak(u: FakeUtterance): void { this.utterances.push(u); }
  cancel(): void { this.cancelled += 1; }
  getVoices(): [] { return []; }
  endLast(): void { this.utterances[this.utterances.length - 1]?.onend?.(); }
}

class FakeRecognition implements RecognitionLike {
  cb: { onTranscript: (t: string, f: boolean) => void; onEnd: () => void } | null = null;
  start(cb: { onTranscript: (t: string, f: boolean) => void; onEnd: () => void }): boolean { this.cb = cb; return true; }
  stop(): void { /* released */ }
  final(t: string): void { this.cb?.onTranscript(t, true); }
  partial(t: string): void { this.cb?.onTranscript(t, false); }
  end(): void { this.cb?.onEnd(); }
}

const plan = (text: string): SpeechPlan => ({
  mode: 'natural', segments: [{ id: 'a', nodeId: 'a', text, pauseAfterMs: 0, boundary: 'none' }],
});

describe('integrated conversation lifecycle (owner failure replay)', () => {
  let synth: FakeSynth;

  beforeEach(() => {
    vi.useFakeTimers();
    clearLifecycleEvents();
    setLifecycleLogEnabled(true);
    synth = new FakeSynth();
    const g = globalThis as unknown as Record<string, unknown>;
    g.window = {
      speechSynthesis: synth,
      setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
      clearTimeout: (id: ReturnType<typeof setTimeout>) => clearTimeout(id),
    };
    g.SpeechSynthesisUtterance = FakeUtterance;
  });

  it('speech completion settles, continuation executes, listening begins, silence runs, answer dispatches once', async () => {
    const provider = new BrowserSpeechProvider();
    let speaking = false;
    const events: string[] = [];

    // 1. Worked-example speech, ending with the owner's exact line.
    const done = new Promise<void>((resolve) => {
      provider.speak(plan('Every step kept the equation balanced.'), {
        onDone: () => { speaking = false; events.push('speech-settled'); resolve(); },
      });
    });
    speaking = true;
    vi.advanceTimersByTime(100); // settle delay after cancel
    expect(synth.utterances.length).toBe(1);
    synth.endLast();
    await done;
    expect(speaking).toBe(false); // lifecycle leaves Speaking

    // 2. The orchestrator plan for this turn (as an older backend
    // returns it: no continuation field, no question, no move).
    const continuation = deriveContinuation(
      { teachingMove: 'none', reply: 'Every step kept the equation balanced.' }, 'example');
    expect(continuation).toBe('teach-next');
    expect(shouldAutoContinue({ continuation, actionsExecuted: 0, alreadyAutoContinued: false, stage: 'example' })).toBe(false);

    // 3. The automatic continuation asks the teaching question.
    const questionDone = new Promise<void>((resolve) => {
      provider.speak(plan('Now we have x plus two equals twelve. What should we do next to find x?'), { onDone: resolve });
    });
    vi.advanceTimersByTime(100);
    synth.endLast();
    await questionDone;
    events.push('question-spoken');

    // 4. Global session: question finished -> listening begins
    // without any button press; navigation (handler swap) keeps it.
    const recognised: FakeRecognition[] = [];
    let handler: (t: string) => Promise<void> = async () => undefined;
    const dispatched: string[] = [];
    const session = new ConversationSession({
      onUtterance: async (t) => { dispatched.push(t); await handler(t); },
      onSnapshot: () => undefined,
      stopSpeech: () => provider.stop(),
      isSpeaking: () => speaking,
    }, () => { const r = new FakeRecognition(); recognised.push(r); return r; });
    await session.enable();
    session.notifySpeaking(true);
    session.notifySpeaking(false); // question speech ended
    vi.advanceTimersByTime(1200);
    expect(recognised.length).toBe(1); // actually listening
    expect(session.snapshot().listening).toBe(true);

    // 5. Silence while hands-free capture is active: reminders
    // are armed (mic open does not suspend the clock), at the
    // configured progression.
    expect(silenceArmed({ awaitingResponse: true, speaking: false, busy: false, listening: true, handsFree: true })).toBe(true);
    expect(SILENCE_INTERVALS_SECONDS).toEqual([45, 30, 45, 60, 90]);
    expect(followUpForStep(0)).toBeTruthy();
    expect(followUpForStep(5)).toBeNull(); // then quiet

    // 6. Learner answers: dispatched exactly once, and the
    // teaching conversation continues from the same context.
    handler = async () => { events.push('teaching-continued'); };
    recognised[0].final('subtract two from both sides');
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(dispatched).toEqual(['subtract two from both sides']);
    expect(events).toContain('teaching-continued');

    // 7. Navigation does not destroy the session: handler swaps,
    // session stays enabled and resumes listening after speech.
    handler = async () => undefined;
    session.notifySpeaking(true);
    session.notifySpeaking(false);
    vi.advanceTimersByTime(1200);
    expect(session.enabled).toBe(true);
    expect(recognised.length).toBe(2);
    session.disable();
    expect(session.snapshot().phase).toBe('off');

    // Lifecycle diagnostics captured the chain.
    const kinds = getLifecycleEvents().map((e) => e.kind);
    expect(kinds).toContain('speech.done');
    expect(kinds).toContain('session.listen-start');
    vi.useRealTimers();
  });

  it('a dropped utterance (no end event) still settles via the watchdog', async () => {
    const provider = new BrowserSpeechProvider();
    let doneFired = false;
    provider.speak(plan('A long explanation that the browser silently drops and never finishes at all.'), {
      onDone: () => { doneFired = true; },
    });
    vi.advanceTimersByTime(100);
    expect(synth.utterances.length).toBe(1);
    // Never fire onend (the browser failure). The watchdog must
    // advance and settle instead of stranding "Speaking" forever.
    vi.advanceTimersByTime(30000);
    expect(doneFired).toBe(true);
    expect(getLifecycleEvents().map((e) => e.kind)).toContain('speech.watchdog');
    vi.useRealTimers();
  });

  it('cancellation settles exactly once and does not resurrect', async () => {
    const provider = new BrowserSpeechProvider();
    let doneCount = 0;
    provider.speak(plan('First attempt.'), { onDone: () => { doneCount += 1; } });
    vi.advanceTimersByTime(100);
    provider.stop(); // learner interrupts
    synth.endLast(); // stale end event from the cancelled utterance
    vi.advanceTimersByTime(30000);
    expect(doneCount).toBe(0); // cancelled speech never reports done
    vi.useRealTimers();
  });
});
