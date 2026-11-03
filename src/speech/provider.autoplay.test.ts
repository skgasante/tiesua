// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { BrowserSpeechProvider } from './provider';
const plan = { mode: 'natural' as const, segments: [{ id: 'g', nodeId: 'g', text: 'Welcome.', pauseAfterMs: 0, boundary: 'none' as const }] };
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
it('ends a blocked automatic greeting promptly, without later playback', () => {
  vi.useFakeTimers();
  let utterance: any;
  const cancel = vi.fn();
  vi.stubGlobal('SpeechSynthesisUtterance', class { text: string; constructor(text: string) { this.text = text; } });
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel, getVoices: () => [], speak: (u: any) => { utterance = u; } } });
  const done = vi.fn(); const provider = new BrowserSpeechProvider();
  provider.speak(plan, { startTimeoutMs: 2000, onDone: done });
  vi.advanceTimersByTime(2060);
  expect(done).toHaveBeenCalledTimes(1);
  expect(cancel).toHaveBeenCalledTimes(2);
  utterance.onend(); vi.advanceTimersByTime(30000);
  expect(done).toHaveBeenCalledTimes(1);
});
it('allows narration to finish naturally once the greeting actually starts', () => {
  vi.useFakeTimers(); let utterance: any;
  vi.stubGlobal('SpeechSynthesisUtterance', class { text: string; constructor(text: string) { this.text = text; } });
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel: vi.fn(), getVoices: () => [], speak: (u: any) => { utterance = u; u.onstart(); } } });
  const done = vi.fn(); const provider = new BrowserSpeechProvider();
  provider.speak(plan, { startTimeoutMs: 2000, onDone: done });
  vi.advanceTimersByTime(3000); expect(done).not.toHaveBeenCalled();
  utterance.onend(); expect(done).toHaveBeenCalledTimes(1);
});

it('reports actual audio start separately from queuing and ignores a stale start after Stop', () => {
  vi.useFakeTimers(); let utterance: any;
  vi.stubGlobal('SpeechSynthesisUtterance', class { text: string; constructor(text: string) { this.text = text; } });
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: { cancel: vi.fn(), getVoices: () => [], speak: (u: any) => { utterance = u; } } });
  const started = vi.fn(); const segment = vi.fn(); const provider = new BrowserSpeechProvider();
  provider.speak(plan, { onStarted: started, onSegment: segment });
  vi.advanceTimersByTime(2000);
  expect(started).not.toHaveBeenCalled(); expect(segment).not.toHaveBeenCalled();
  utterance.onstart(); expect(started).toHaveBeenCalledTimes(1); expect(segment).toHaveBeenCalledTimes(1);
  provider.stop(); utterance.onstart(); expect(started).toHaveBeenCalledTimes(1);
});

it('cancels native playback before releasing a stalled utterance, never inventing a natural end', () => {
  vi.useFakeTimers(); let utterance: any;
  const order: string[] = [];
  vi.stubGlobal('SpeechSynthesisUtterance', class { constructor(public text: string) {} });
  Object.defineProperty(window, 'speechSynthesis', { configurable: true, value: {
    cancel: () => order.push('cancel'), getVoices: () => [], speak: (u: any) => { utterance = u; u.onstart(); },
  } });
  const done = vi.fn(); const failed = vi.fn(() => order.push('failed'));
  const provider = new BrowserSpeechProvider();
  provider.speak(plan, { onDone: done, onFailure: failed });
  vi.advanceTimersByTime(20000);
  expect(order).toEqual(['cancel', 'cancel', 'failed']);
  expect(done).not.toHaveBeenCalled();
  utterance.onend(); utterance.onstart();
  expect(failed).toHaveBeenCalledTimes(1);
  expect(done).not.toHaveBeenCalled();
});
