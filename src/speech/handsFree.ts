/** EXPERIMENTAL hands-free barge-in (isolated - not the default
 * interaction). Strategy: a local energy-based voice activity
 * detector (VAD) watches the microphone while TieSua speaks. A
 * sustained onset (not a single spike) stops speech immediately,
 * then ordinary browser recognition captures the full statement.
 *
 * Honest limits, by design:
 * - Onset detection is energy, not speaker identification. Through
 *   loudspeakers, TieSua's own voice can cross the threshold; the
 *   sensitivity presets and the "own speech" guard reduce but cannot
 *   eliminate this. Headphones are the recommended test setup.
 * - Recognition starts at onset, so the first fraction of a second
 *   of the interruption can be clipped. If recognition returns
 *   nothing, the learner is asked to say it once more - the opening
 *   words are never silently treated as a complete instruction.
 * - No audio leaves the device for detection; recognition uses the
 *   browser's existing service, exactly like push-to-talk.
 * - A cooldown after each onset prevents restart loops. */

export interface VadOptions {
  /** RMS energy threshold (0..1). Higher = less sensitive. */
  threshold: number;
  /** Consecutive loud frames required before onset fires. */
  onsetFrames: number;
  /** Frames per second the analyser is sampled at. */
  framesPerSecond: number;
  /** Minimum silence between two onsets, in frames. */
  cooldownFrames: number;
}

export const VAD_PRESETS: Record<'headphones' | 'speakers', VadOptions> = {
  headphones: { threshold: 0.045, onsetFrames: 3, framesPerSecond: 20, cooldownFrames: 30 },
  speakers: { threshold: 0.085, onsetFrames: 4, framesPerSecond: 20, cooldownFrames: 40 },
};

/** Pure, testable onset detector over RMS frames. */
export class VadGate {
  private loudRun = 0;
  private cooldown = 0;
  private needsQuiet = false;
  constructor(private options: VadOptions) {}

  /** Returns 'onset' exactly once per genuine speech start. After an
   * onset the gate must hear quiet again before re-arming, so one
   * long utterance (or continuous loud sound) can never loop. */
  pushFrame(rms: number): 'onset' | null {
    if (rms < this.options.threshold) {
      this.needsQuiet = false;
      this.loudRun = 0;
    }
    if (this.needsQuiet) return null;
    if (this.cooldown > 0) {
      this.cooldown -= 1;
      this.loudRun = 0;
      return null;
    }
    if (rms >= this.options.threshold) {
      this.loudRun += 1;
      if (this.loudRun >= this.options.onsetFrames) {
        this.loudRun = 0;
        this.cooldown = this.options.cooldownFrames;
        this.needsQuiet = true;
        return 'onset';
      }
    } else {
      this.loudRun = 0;
    }
    return null;
  }

  reset(): void {
    this.loudRun = 0;
    this.cooldown = 0;
    this.needsQuiet = false;
  }
}

export type HandsFreeState = 'off' | 'watching' | 'interrupted-listening';

export interface HandsFreeCallbacks {
  /** Learner speech onset detected while app speech was playing. */
  onOnset: (rms: number) => void;
  onState: (state: HandsFreeState) => void;
}

/** Microphone lifecycle for the experiment. Owns the media stream
 * and releases it fully on stop - tracks stopped, context closed. */
export class HandsFreeController {
  private stream: MediaStream | null = null;
  private context: AudioContext | null = null;
  private timer: number | null = null;
  private gate: VadGate;
  state: HandsFreeState = 'off';

  constructor(private callbacks: HandsFreeCallbacks, preset: 'headphones' | 'speakers' = 'headphones') {
    this.gate = new VadGate(VAD_PRESETS[preset]);
  }

  setPreset(preset: 'headphones' | 'speakers'): void {
    this.gate = new VadGate(VAD_PRESETS[preset]);
  }

  async start(): Promise<boolean> {
    if (this.state !== 'off') return true;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch {
      return false; // permission denied or no microphone - caller reports honestly
    }
    const ContextClass = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!ContextClass) { this.stop(); return false; }
    this.context = new ContextClass();
    const source = this.context.createMediaStreamSource(this.stream);
    const analyser = this.context.createAnalyser();
    analyser.fftSize = 512;
    source.connect(analyser);
    const buffer = new Uint8Array(analyser.fftSize);
    const intervalMs = 1000 / 20;
    this.setState('watching');
    this.timer = window.setInterval(() => {
      analyser.getByteTimeDomainData(buffer);
      let sum = 0;
      for (let i = 0; i < buffer.length; i++) {
        const v = (buffer[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / buffer.length);
      if (this.gate.pushFrame(rms) === 'onset' && this.state === 'watching') {
        this.setState('interrupted-listening');
        this.callbacks.onOnset(rms);
      }
    }, intervalMs);
    return true;
  }

  /** Recognition finished (or failed): resume watching. */
  resumeWatching(): void {
    if (this.state === 'interrupted-listening') {
      this.gate.reset();
      this.setState('watching');
    }
  }

  stop(): void {
    if (this.timer !== null) window.clearInterval(this.timer);
    this.timer = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    void this.context?.close().catch(() => undefined);
    this.context = null;
    this.setState('off');
  }

  private setState(state: HandsFreeState): void {
    this.state = state;
    this.callbacks.onState(state);
  }
}
