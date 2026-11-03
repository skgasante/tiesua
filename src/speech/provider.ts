import type { SpeechPlan } from './speechPlan';
import { applyPauseScale, renderLegacyUtterances, renderUtterances } from './render';
import { logLifecycle } from './lifecycleLog';
import { preferredVoice } from './preferredVoice';

/** Interchangeable speech-output providers. The structured speech
 * engine only produces SpeechPlans; any provider (browser TTS now,
 * a local neural engine such as Kokoro after evaluation) renders
 * the same plan, so mathematical meaning never depends on a voice. */

export interface SpeakOptions {
  rate?: number;        // clamped to 0.5 – 2.5
  pauseScale?: number;  // multiplies planned pauses; 0 = near-zero pauses
  volume?: number;      // utterance volume 0–1 (browser maximum is 1)
  voiceURI?: string;
  /** Play one utterance per plan segment (pre-improvement style),
   * for the listening experiment only. */
  legacy?: boolean;
  /** Optional deadline for an unprompted greeting to actually begin playing. */
  startTimeoutMs?: number;
  onSegment?: (index: number) => void;
  onStarted?: () => void;
  onDone?: () => void;
  onFailure?: () => void;
}

export interface SpeechProvider {
  readonly name: string;
  isSupported(): boolean;
  speak(plan: SpeechPlan, opts?: SpeakOptions): void;
  stop(): void;
  voices(): { name: string; lang: string; uri: string }[];
}

export class BrowserSpeechProvider implements SpeechProvider {
  readonly name = 'Browser speech synthesis';
  private timer: number | undefined;
  private generation = 0;

  isSupported(): boolean {
    return typeof window !== 'undefined' && 'speechSynthesis' in window;
  }

  voices() {
    if (!this.isSupported()) return [];
    return window.speechSynthesis.getVoices().map((v) => ({ name: v.name, lang: v.lang, uri: v.voiceURI }));
  }

  stop(): void {
    this.generation++;
    if (this.timer !== undefined) { window.clearTimeout(this.timer); this.timer = undefined; }
    if (this.isSupported()) window.speechSynthesis.cancel();
  }

  speak(plan: SpeechPlan, opts: SpeakOptions = {}): void {
    if (!this.isSupported()) { opts.onDone?.(); return; }
    this.stop();
    const gen = ++this.generation;
    const rate = Math.min(2.5, Math.max(0.5, opts.rate ?? 1));
    const pauseScale = opts.pauseScale ?? 1;
    // Phrase-level rendering by default: far fewer synthesis
    // restarts, connected phrases, silence only at real boundaries.
    const segments = applyPauseScale(opts.legacy ? renderLegacyUtterances(plan) : renderUtterances(plan), pauseScale);
    let index = 0;
    let doneFired = false;
    const fireDone = (): void => {
      if (doneFired || gen !== this.generation) return;
      doneFired = true;
      logLifecycle('speech.done', `${segments.length} segment(s)`);
      opts.onDone?.();
    };

    const speakNext = (): void => {
      if (gen !== this.generation) return;
      if (index >= segments.length) { fireDone(); return; }
      const segment = segments[index];
      const utterance = new SpeechSynthesisUtterance(segment.text);
      utterance.rate = rate;
      utterance.volume = Math.min(1, Math.max(0, opts.volume ?? 1));
      utterance.pitch = segment.pitch;
      {
        const available = window.speechSynthesis.getVoices();
        const voice = available.find((v) => v.voiceURI === opts.voiceURI) ?? preferredVoice(available);
        if (voice) utterance.voice = voice;
      }
      let settled = false;
      let startTimer: number | undefined;
      utterance.onstart = () => {
        if (settled || gen !== this.generation) return;
        if (startTimer !== undefined) window.clearTimeout(startTimer);
        logLifecycle('speech.audible-start', `segment ${index}`);
        opts.onStarted?.(); opts.onSegment?.(index);
      };
      if (opts.startTimeoutMs !== undefined) {
        startTimer = window.setTimeout(() => {
          if (settled || gen !== this.generation) return;
          settled = true;
          window.clearTimeout(watchdog);
          this.stop();
          logLifecycle('speech.autoplay-blocked', 'microphone button available');
          opts.onDone?.();
        }, opts.startTimeoutMs);
      }
      // Watchdog: browsers can drop an utterance (notably when
      // speak() follows cancel() closely, or on long text with
      // remote voices) and then NEITHER onend nor onerror ever
      // fires. Without this, "speaking" never settles and the
      // whole conversation lifecycle (listening, continuation,
      // silence reminders) stalls behind it.
      const expectedMs = (segment.text.length / (13 * rate)) * 1000 + 7000;
      const watchdog = window.setTimeout(() => {
        if (settled || gen !== this.generation) return;
        settled = true;
        if (startTimer !== undefined) window.clearTimeout(startTimer);
        // A duration estimate is never evidence that playback ended.
        // Cancel the native queue before releasing the microphone interlock.
        this.stop();
        logLifecycle('speech.watchdog', `segment ${index} produced no end event; playback cancelled`);
        if (opts.onFailure) opts.onFailure(); else opts.onDone?.();
      }, expectedMs);
      const settle = (kind: 'end' | 'error'): void => {
        if (settled || gen !== this.generation) return;
        settled = true;
        if (startTimer !== undefined) window.clearTimeout(startTimer);
        window.clearTimeout(watchdog);
        if (kind === 'end') logLifecycle('speech.segment-end', `segment ${index}`);
        index++;
        const pause = segment.pauseAfterMs;
        if (index < segments.length && pause > 0) {
          this.timer = window.setTimeout(speakNext, pause);
        } else {
          speakNext();
        }
      };
      utterance.onend = () => settle('end');
      utterance.onerror = () => settle('error');
      logLifecycle('speech.start', `segment ${index}: ${segment.text.slice(0, 60)}`);
      window.speechSynthesis.speak(utterance);
    };
    // A short settle delay after cancel(): speaking in the same
    // tick as a cancel is a known browser drop race.
    this.timer = window.setTimeout(speakNext, 60);
  }
}

/** Capability report shown honestly in the app. Browser speech
 * recognition is Chromium-only in practice, does not accept
 * mathematical vocabulary hints, and is not assumed to work offline;
 * typed input is therefore always an equal path, never a fallback
 * apology. Local neural TTS (Kokoro) remains an evaluation item
 * behind this same interface — see docs/SPEECH_PROVIDERS.md. */
export function speechCapabilities() {
  const synthesis = typeof window !== 'undefined' && 'speechSynthesis' in window;
  const recognitionCtor = typeof window !== 'undefined'
    ? (window as unknown as Record<string, unknown>).SpeechRecognition ?? (window as unknown as Record<string, unknown>).webkitSpeechRecognition
    : undefined;
  return { synthesis, recognition: typeof recognitionCtor === 'function' };
}
