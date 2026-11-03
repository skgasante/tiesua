import { describe, expect, it } from 'vitest';
import { VAD_PRESETS, VadGate } from './handsFree';

const frames = (rms: number, n: number) => Array.from({ length: n }, () => rms);

describe('VadGate onset detection', () => {
  it('fires once on sustained learner speech, not on silence', () => {
    const gate = new VadGate(VAD_PRESETS.headphones);
    expect(frames(0.001, 30).map((f) => gate.pushFrame(f))).not.toContain('onset');
    const speech = [...frames(0.2, 3)];
    expect(speech.map((f) => gate.pushFrame(f))).toContain('onset');
  });
  it('ignores a single spike (cough, click, door)', () => {
    const gate = new VadGate(VAD_PRESETS.headphones);
    const seq = [0.001, 0.4, 0.001, 0.001, 0.001];
    expect(seq.map((f) => gate.pushFrame(f))).not.toContain('onset');
  });
  it('cooldown prevents a restart loop from one utterance', () => {
    const gate = new VadGate(VAD_PRESETS.headphones);
    let onsets = 0;
    for (const f of frames(0.25, 200)) if (gate.pushFrame(f) === 'onset') onsets += 1;
    expect(onsets).toBe(1);
  });
  it('speakers preset needs stronger, longer energy than headphones', () => {
    const hp = new VadGate(VAD_PRESETS.headphones);
    const sp = new VadGate(VAD_PRESETS.speakers);
    const seq = frames(0.06, 3);
    expect(seq.map((f) => hp.pushFrame(f))).toContain('onset');
    expect(seq.map((f) => sp.pushFrame(f))).not.toContain('onset');
  });
  it('reset allows a new onset after recognition completes', () => {
    const gate = new VadGate(VAD_PRESETS.headphones);
    frames(0.2, 3).forEach((f) => gate.pushFrame(f));
    gate.reset();
    expect(frames(0.2, 3).map((f) => gate.pushFrame(f))).toContain('onset');
  });
});
