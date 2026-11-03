/** @vitest-environment jsdom */
import { expect, it, vi } from 'vitest';
import { BrowserRecognition } from './recognition';

it('collects multiple phrases across pauses and dispatches once after quiet', () => {
  vi.useFakeTimers();
  let rec: any;
  class Fake { onresult: any; start() { rec = this; } stop() {} }
  (window as any).SpeechRecognition = Fake;
  const transcript = vi.fn();
  const recognition = new BrowserRecognition();
  recognition.start({ onTranscript: transcript, onEnd: vi.fn() });
  rec.onresult({ results: [{ 0: { transcript: 'I understand the multiplication' }, isFinal: true }] });
  vi.advanceTimersByTime(1500);
  expect(transcript.mock.calls.filter(c => c[1])).toHaveLength(0);
  rec.onresult({ results: [
    { 0: { transcript: 'I understand the multiplication' }, isFinal: true },
    { 0: { transcript: 'but why subtract two' }, isFinal: true },
  ] });
  vi.advanceTimersByTime(2000);
  expect(transcript.mock.calls.filter(c => c[1])).toEqual([['I understand the multiplication but why subtract two', true]]);
  recognition.stop();
  vi.useRealTimers();
});

it('honours a longer learner-selected pause before submitting speech', () => {
  vi.useFakeTimers(); localStorage.setItem('tiesua-listening-quiet-seconds', '5');
  let rec: any;
  class Fake { onresult: any; start() { rec = this; } stop() {} }
  (window as any).SpeechRecognition = Fake;
  const transcript = vi.fn(); const recognition = new BrowserRecognition();
  recognition.start({ onTranscript: transcript, onEnd: vi.fn() });
  rec.onresult({ results: [{ 0: { transcript: 'Let me think' }, isFinal: true }] });
  vi.advanceTimersByTime(4999); expect(transcript.mock.calls.filter(c => c[1])).toHaveLength(0);
  vi.advanceTimersByTime(1); expect(transcript.mock.calls.filter(c => c[1])).toHaveLength(1);
  recognition.stop(); localStorage.removeItem('tiesua-listening-quiet-seconds'); vi.useRealTimers();
});
