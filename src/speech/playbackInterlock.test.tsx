// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { useSpeech } from './useSpeech';
import { ConversationSession, type RecognitionLike } from './conversationSession';

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });
it('suspends capture before React paints and keeps delayed narration, speaker tails and obsolete callbacks out of learner turns', async () => {
  vi.useFakeTimers();
  (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
  let utterance: any;
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
    cancel: vi.fn(), getVoices: () => [], speak: (u: any) => { utterance = u; },
  } });
  let player: ReturnType<typeof useSpeech>;
  function Harness() {
    player = useSpeech({ rate: 1, pauseScale: 1, volume: 1, voiceURI: '', textSize: 100, announceMode: 'app-voice', talkShortcut: 'none' });
    return null;
  }
  const host = document.createElement('div'); const root = createRoot(host);
  await act(async () => root.render(<Harness />));
  const captures: { cb: any; stopped: boolean }[] = []; const dispatch = vi.fn();
  const session = new ConversationSession({
    onUtterance: dispatch, onSnapshot: () => {}, stopSpeech: () => player.stop(), isSpeaking: () => player.isSpeaking(),
  }, () => {
    const capture = { cb: null as any, stopped: false }; captures.push(capture);
    return { start(cb) { capture.cb = cb; cb.onStarted?.(); return true; }, stop() { capture.stopped = true; } } satisfies RecognitionLike;
  });
  player!.setActivityListener(active => session.notifySpeaking(active));
  await session.enable(); vi.advanceTimersByTime(400);
  const old = captures[0];
  const plan = { mode: 'natural' as const, segments: [{ id: 'p', nodeId: 'p', text: 'Imagine twelve sweets and four friends. What do you think equally means?', pauseAfterMs: 0, boundary: 'none' as const }] };
  await act(async () => {
    player.speak(plan);
    // No render/effect or native audio start has happened yet.
    expect(old.stopped).toBe(true);
    expect(session.snapshot().listening).toBe(false);
    old.cb.onTranscript(plan.segments[0].text, true);
    vi.advanceTimersByTime(60);
    utterance.onstart();
    vi.advanceTimersByTime(6000);
    expect(captures).toHaveLength(1);
    expect(dispatch).not.toHaveBeenCalled();
    utterance.onend();
    // Processing/navigation must not bypass the shared speaker-tail deadline.
    session.setTransitionPending(true); session.setTransitionPending(false);
    vi.advanceTimersByTime(299);
    expect(captures).toHaveLength(1);
    old.cb.onTranscript('equally means', true);
    vi.advanceTimersByTime(1);
    expect(captures).toHaveLength(2);
    captures[1].cb.onTranscript('everyone gets the same number', true);
    captures[1].cb.onTranscript('everyone gets the same number', true);
    await Promise.resolve();
    expect(dispatch).toHaveBeenCalledExactlyOnceWith('everyone gets the same number');
  });
  session.disable(); player!.setActivityListener(null);
  await act(async () => root.unmount());
});
