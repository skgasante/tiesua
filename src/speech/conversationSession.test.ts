import { describe, expect, it, vi } from 'vitest';
import { ConversationSession, type RecognitionLike } from './conversationSession';

class FakeRecognition implements RecognitionLike {
  callbacks: { onTranscript: (t: string, f: boolean) => void; onEnd: () => void } | null = null;
  stopped = false;
  start(cb: { onTranscript: (t: string, f: boolean) => void; onEnd: () => void; onStarted?: () => void }): boolean {
    this.callbacks = cb;
    cb.onStarted?.();
    return true;
  }
  stop(): void { this.stopped = true; }
  final(text: string): void { this.callbacks?.onTranscript(text, true); }
  partial(text: string): void { this.callbacks?.onTranscript(text, false); }
  end(): void { this.callbacks?.onEnd(); }
}

function harness() {
  const fakes: FakeRecognition[] = [];
  const utterances: string[] = [];
  let speaking = false;
  let stoppedSpeech = 0;
  const session = new ConversationSession({
    onUtterance: async (t) => { utterances.push(t); },
    onSnapshot: () => undefined,
    stopSpeech: () => { stoppedSpeech += 1; speaking = false; },
    isSpeaking: () => speaking,
  }, () => { const f = new FakeRecognition(); fakes.push(f); return f; });
  return { session, fakes, utterances, setSpeaking: (v: boolean) => { speaking = v; session.notifySpeaking(v); }, stoppedSpeech: () => stoppedSpeech };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('global conversation session turn-taking', () => {
  it('waits for the speaker tail after natural speech ends', async () => {
    vi.useFakeTimers();
    const h = harness();
    await h.session.enable(); vi.advanceTimersByTime(400);
    h.setSpeaking(true);
    expect(h.session.snapshot().listening).toBe(false);
    const before = h.fakes.length;
    vi.advanceTimersByTime(30000);
    expect(h.fakes).toHaveLength(before);
    h.setSpeaking(false);
    vi.advanceTimersByTime(300);
    expect(h.fakes).toHaveLength(before + 1);
    expect(h.session.snapshot().listening).toBe(true);
    h.session.disable(); vi.useRealTimers();
  });

  it('turns off capture and offers recovery after a recognition error', async () => {
    vi.useFakeTimers();
    let fail: (() => void) | undefined;
    const recovery = vi.fn();
    const session = new ConversationSession({ onUtterance: () => {}, onSnapshot: () => {}, stopSpeech: () => {}, isSpeaking: () => false, onRecognitionError: recovery }, () => ({ start: callbacks => { fail = callbacks.onError; return true; }, stop: () => {} }));
    await session.enable(); vi.advanceTimersByTime(1000);
    expect(session.snapshot().listening).toBe(true);
    fail!();
    expect(session.snapshot().enabled).toBe(false);
    expect(session.snapshot().listening).toBe(false);
    expect(recovery).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10000);
    expect(session.snapshot().listening).toBe(false);
    vi.useRealTimers();
  });
  it('does not report listening after a synchronous recognition failure', async () => {
    vi.useFakeTimers();
    const recovery = vi.fn();
    const session = new ConversationSession({
      onUtterance: () => {}, onSnapshot: () => {}, stopSpeech: () => {}, isSpeaking: () => false, onRecognitionError: recovery,
    }, () => ({ start: callbacks => { callbacks.onError?.('network'); return true; }, stop: () => {} }));
    await session.enable(); vi.advanceTimersByTime(1000);
    expect(session.snapshot()).toMatchObject({ enabled: false, listening: false, phase: 'off' });
    expect(recovery).toHaveBeenCalledWith('network');
    vi.advanceTimersByTime(60000);
    expect(recovery).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });
  it('opens listening on the next turn after natural speech completion, never during speech', async () => {
    vi.useFakeTimers();
    const h = harness();
    h.setSpeaking(true);
    await h.session.enable();
    vi.advanceTimersByTime(1000);
    expect(h.fakes).toHaveLength(0);
    h.setSpeaking(false);
    vi.advanceTimersByTime(300);
    expect(h.session.snapshot().listening).toBe(true);
    h.session.disable(); vi.useRealTimers();
  });
  it('signals listening start and end once without chirping on silent restarts', async () => {
    vi.useFakeTimers();
    const fakes: FakeRecognition[] = []; const cues: string[] = [];
    const session = new ConversationSession({
      onUtterance: async () => {}, onSnapshot: () => {}, stopSpeech: () => {}, isSpeaking: () => false,
      onListeningCue: cue => cues.push(cue),
    }, () => { const f = new FakeRecognition(); fakes.push(f); return f; });
    await session.enable(); vi.advanceTimersByTime(1000);
    expect(cues).toEqual(['start']);
    fakes[0].end(); vi.advanceTimersByTime(3000);
    expect(cues).toEqual(['start']);
    fakes[1].final('hello'); await Promise.resolve(); await Promise.resolve();
    expect(cues).toEqual(['start', 'end']);
    session.disable(); expect(cues).toEqual(['start', 'end']);
    vi.useRealTimers();
  });
  it('does not signal listening when recognition cannot start', async () => {
    vi.useFakeTimers(); const cues: string[] = [];
    const session = new ConversationSession({ onUtterance: () => {}, onSnapshot: () => {}, stopSpeech: () => {}, isSpeaking: () => false, onListeningCue: cue => cues.push(cue) },
      () => ({ start: () => false, stop: () => {} }));
    await session.enable(); vi.advanceTimersByTime(1000);
    expect(cues).toEqual([]); session.disable(); vi.useRealTimers();
  });
  it('listens after speech ends, dispatches once, then listens again', async () => {
    vi.useFakeTimers();
    const h = harness();
    await h.session.enable();
    h.setSpeaking(true);
    h.setSpeaking(false); // TieSua finished a question
    vi.advanceTimersByTime(1000);
    expect(h.fakes.length).toBe(1); // auto-listening started
    h.fakes[0].final('What lessons do you have?');
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(h.utterances).toEqual(['What lessons do you have?']); // exactly once
    h.setSpeaking(true); // TieSua answers
    h.setSpeaking(false);
    vi.advanceTimersByTime(1000);
    expect(h.fakes.length).toBe(2); // resumed listening, no Talk press
    vi.useRealTimers();
  });

  it('never starts recognition while TieSua is speaking', async () => {
    vi.useFakeTimers();
    const h = harness();
    await h.session.enable();
    h.setSpeaking(true);
    vi.advanceTimersByTime(5000);
    expect(h.fakes.length).toBe(0);
    vi.useRealTimers();
  });

  it('empty recognitions back off and go dormant instead of looping', async () => {
    vi.useFakeTimers();
    const h = harness();
    await h.session.enable();
    vi.advanceTimersByTime(1000);
    expect(h.fakes.length).toBe(1);
    for (let i = 0; i < 10; i += 1) { h.fakes[h.fakes.length - 1].end(); vi.advanceTimersByTime(10000); }
    const count = h.fakes.length;
    vi.advanceTimersByTime(60000);
    expect(h.fakes.length).toBe(count); // dormant: no restart loop
    expect(count).toBeLessThanOrEqual(8);
    vi.useRealTimers();
  });

  it('disable releases the microphone and ends the session', async () => {
    vi.useFakeTimers();
    const h = harness();
    await h.session.enable();
    vi.advanceTimersByTime(1000);
    h.session.disable();
    expect(h.session.enabled).toBe(false);
    expect(h.fakes[0].stopped).toBe(true);
    vi.advanceTimersByTime(10000);
    expect(h.fakes.length).toBe(1); // nothing restarts after disable
    vi.useRealTimers();
  });

  it('SELF-ECHO: TieSua speaking suspends recognition; a stale echo final is never dispatched', async () => {
    vi.useFakeTimers();
    const h = harness();
    await h.session.enable();
    vi.advanceTimersByTime(1000);
    expect(h.fakes.length).toBe(1); // auto-listening
    // TieSua speaks its silence reminder while the mic was open.
    h.setSpeaking(true);
    expect(h.fakes[0].stopped).toBe(true); // recognition suspended structurally
    // The browser still delivers the echo as a stale final.
    h.fakes[0].final('take your time I am here');
    await Promise.resolve(); await Promise.resolve();
    expect(h.utterances).toEqual([]); // never a learner answer
    // Speech ends; after the settling period, listening resumes.
    h.setSpeaking(false);
    vi.advanceTimersByTime(5000);
    expect(h.fakes.length).toBe(2);
    // A learner legitimately repeating the same words IS heard:
    // the guard is timing/state, never text similarity.
    h.fakes[1].final('take your time I am here');
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(h.utterances).toEqual(['take your time I am here']);
    vi.useRealTimers();
  });

  it('push-to-talk captures one utterance when the session is off', async () => {
    const h = harness();
    h.session.listenOnce();
    expect(h.fakes.length).toBe(1);
    h.fakes[0].partial('three times');
    h.fakes[0].final('three times four makes twelve');
    await tick();
    expect(h.utterances).toEqual(['three times four makes twelve']);
  });
});
