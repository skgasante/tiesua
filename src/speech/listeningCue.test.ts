import { afterEach, expect, it, vi } from 'vitest';
import { ListeningCue } from './listeningCue';

afterEach(() => vi.unstubAllGlobals());

it('plays louder, distinct start and end cues without changing speech settings', () => {
  const ramp = vi.fn();
  const frequencies: { value: number }[] = [];
  const context = {
    state: 'running', currentTime: 0, destination: {},
    createOscillator: () => { const frequency = { value: 0 }; frequencies.push(frequency); return { type: '', frequency, connect: vi.fn(), start: vi.fn(), stop: vi.fn() }; },
    createGain: () => ({ gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: ramp }, connect: vi.fn() }),
  };
  vi.stubGlobal('AudioContext', function () { return context; });
  const cues = new ListeningCue(); cues.unlock(); cues.play('start'); cues.play('end');
  expect(frequencies.map((f) => f.value)).toEqual([740, 440]);
  expect(ramp.mock.calls.filter(([value]) => value === .24)).toHaveLength(2);
});
