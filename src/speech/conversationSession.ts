/** Application-level conversation session: ONE owner of the
 * microphone, voice-activity barge-in and turn-taking for the
 * whole app (Home, Lessons, Explore, Settings, lesson runner).
 *
 * Lifecycle:
 * - The learner enables it once (explicit action -> microphone
 *   permission). It then persists across navigation until the
 *   learner stops it, permission is revoked, or the app unmounts.
 * - TieSua speaking -> session waits. Speech ends -> the session
 *   listens automatically. A final utterance is dispatched ONCE
 *   to whichever screen handler is registered, processing is
 *   awaited, TieSua responds, and listening resumes after that
 *   speech ends. No screen ever re-implements this loop.
 * - Interruption uses the microphone/Stop controls. Acoustic barge-in
 *   is not enabled. Capture stays suspended throughout queued playback
 *   and for a short speaker-tail guard after completion.
 * - Empty recognitions back off and eventually go dormant until
 *   the next speech cycle - no restart loops, no duplicate calls:
 *   an utterance is dispatched exactly once, and the next listen
 *   waits for processing + speech to finish.
 */

import { BrowserRecognition } from './recognition';
import { logLifecycle } from './lifecycleLog';

export type SessionPhase = 'off' | 'idle' | 'speaking' | 'listening' | 'thinking';

export const PHASE_LABEL: Record<SessionPhase, string> = {
  off: 'Microphone off', idle: 'Conversation on', speaking: 'Speaking', listening: 'Listening', thinking: 'Thinking',
};

export interface SessionSnapshot {
  enabled: boolean;
  phase: SessionPhase;
  listening: boolean;
  /** Recognition has given up auto-restarting after repeated empty
   * results. The UI must say so honestly, never claim Listening. */
  dormant: boolean;
}

export interface RecognitionLike {
  start(callbacks: { onTranscript: (text: string, isFinal: boolean) => void; onEnd: () => void; onStarted?: () => void; onError?: (reason?: string) => void }): boolean;
  stop(): void;
}

export interface ConversationHooks {
  /** Dispatch one final learner utterance to the active screen. */
  onUtterance: (text: string) => Promise<void> | void;
  /** Live partial transcript for the current-utterance display. */
  onPartial?: (text: string) => void;
  onSnapshot: (snapshot: SessionSnapshot) => void;
  stopSpeech: () => void;
  isSpeaking: () => boolean;
  onListeningCue?: (kind: 'start' | 'end') => void;
  onRecognitionError?: (reason?: string) => void;
}

const MAX_EMPTY_RESTARTS = 6;
/** Quiet period between TieSua finishing speaking and the
 * microphone opening, so playback tail cannot be recognised as
 * learner speech. */
const SETTLE_MS = 300;

export class ConversationSession {
  enabled = false;
  private phase: SessionPhase = 'off';
  private recognition: RecognitionLike | null = null;
  private listeningNow = false;
  private processing = false;
  private transitionPending = false;
  private speakingNow = false;
  private captureAfter = 0;
  private restartTimer: ReturnType<typeof setTimeout> | null = null;
  private emptyRestarts = 0;
  private dormant = false;
  private gotFinal = false;
  private cueOpen = false;

  private cue(kind: 'start' | 'end'): void {
    if ((kind === 'start') === this.cueOpen) return;
    this.cueOpen = kind === 'start';
    this.hooks.onListeningCue?.(kind);
  }

  constructor(
    private hooks: ConversationHooks,
    private createRecognition: () => RecognitionLike = () => new BrowserRecognition(),
  ) {}

  snapshot(): SessionSnapshot {
    return { enabled: this.enabled, phase: this.phase, listening: this.listeningNow, dormant: this.dormant };
  }

  private emit(phase: SessionPhase): void {
    this.phase = phase;
    logLifecycle('session.phase', phase);
    this.hooks.onSnapshot(this.snapshot());
  }

  /** Enable hands-free conversation (explicit learner action).
   * Returns false when neither microphone path is available. */
  async enable(): Promise<boolean> {
    if (this.enabled) return true;
    // NOTE: energy-based VAD barge-in is deliberately NOT armed
    // here. Through loudspeakers it cannot distinguish the learner
    // from TieSua's own output (the self-echo failure). Safe
    // interruption is the Stop button / Talk press (explicit
    // learner action); automatic turn-taking after speech is the
    // hands-free path. VAD stays in the isolated lab only.
    this.enabled = true;
    this.dormant = false;
    this.emptyRestarts = 0;
    this.emit(this.speakingNow ? 'speaking' : 'idle');
    if (!this.speakingNow) this.scheduleListen(400);
    return true;
  }

  /** End the session and release every microphone resource. */
  disable(): void {
    this.cue('end');
    this.enabled = false;
    this.transitionPending = false;
    this.dormant = false;
    this.clearRestart();
    this.recognition?.stop();
    this.recognition = null;
    this.listeningNow = false;
    this.emit('off');
  }

  /** Keep the microphone closed while the next screen prepares its first
   * response, even after the previous screen's handler has returned. */
  setTransitionPending(pending: boolean): void {
    this.transitionPending = pending;
    if (pending) {
      this.clearRestart();
      this.recognition?.stop(); this.recognition = null; this.listeningNow = false;
      this.cue('end');
      if (this.enabled && !this.speakingNow) this.emit('thinking');
    } else if (this.enabled && !this.processing && !this.speakingNow && !this.hooks.isSpeaking()) {
      this.scheduleListen(0);
    }
  }

  /** Speech-state feed from the single speech player. The
   * speaking -> not-speaking edge is what resumes listening. */
  notifySpeaking(speaking: boolean): void {
    const was = this.speakingNow;
    this.speakingNow = speaking;
    if (speaking) {
      this.cue('end');
      // STRUCTURAL SELF-ECHO GUARD: learner recognition is
      // suspended for the whole of TieSua's speech - silence
      // reminders included. An open microphone during playback is
      // exactly how TieSua came to "hear" its own reminder.
      this.clearRestart();
      if (this.listeningNow) {
        this.recognition?.stop();
        this.recognition = null;
        this.listeningNow = false;
        this.cue('end');
        logLifecycle('session.suspend-for-speech', 'recognition stopped while TieSua speaks');
      }
      if (this.enabled && !this.listeningNow) this.emit('speaking');
      return;
    }
    if (!this.enabled) return;
    if (was && !speaking) {
      this.captureAfter = Date.now() + SETTLE_MS;
      this.dormant = false;
      this.emptyRestarts = 0;
      // Allow the speaker tail to drain after actual completion. Every restart
      // path observes captureAfter, including processing and navigation.
      if (!this.processing) this.scheduleListen(SETTLE_MS);
      else this.emit('thinking');
    }
  }

  /** Push-to-talk: capture one utterance now (works whether or not
   * the session is enabled). If already listening, stop instead.
   * Pressing Talk during speech is the learner's explicit, safe
   * interruption: stop TieSua, settle briefly, then capture. */
  listenOnce(): void {
    if (this.listeningNow) { this.stopListening(); return; }
    if (this.speakingNow) {
      this.hooks.stopSpeech();
      this.speakingNow = false;
      this.clearRestart();
      const wasEnabled = this.enabled;
      this.restartTimer = setTimeout(() => {
        this.restartTimer = null;
        if ((!wasEnabled || this.enabled) && !this.hooks.isSpeaking()) this.startRecognition();
      }, 350);
      return;
    }
    this.startRecognition();
  }

  stopListening(): void {
    this.cue('end');
    this.clearRestart();
    this.recognition?.stop();
    this.recognition = null;
    this.listeningNow = false;
    if (this.enabled) this.emit(this.speakingNow ? 'speaking' : 'idle');
    else this.emit('off');
  }

  private clearRestart(): void {
    if (this.restartTimer !== null) clearTimeout(this.restartTimer);
    this.restartTimer = null;
  }

  private scheduleListen(delayMs: number): void {
    if (!this.enabled || this.dormant) return;
    this.clearRestart();
    const delay = Math.max(this.captureAfter - Date.now(), Math.min(4000, delayMs + this.emptyRestarts * 600));
    this.restartTimer = setTimeout(() => {
      this.restartTimer = null;
      if (this.enabled && !this.speakingNow && !this.hooks.isSpeaking() && !this.processing && !this.transitionPending && !this.listeningNow) this.startRecognition();
    }, delay);
  }

  private startRecognition(): void {
    if (this.listeningNow || this.processing || this.transitionPending) return;
    if (this.speakingNow || this.hooks.isSpeaking()) return; // never transcribe TieSua
    if (Date.now() < this.captureAfter) { this.scheduleListen(this.captureAfter - Date.now()); return; }
    const recognition = this.createRecognition();
    this.recognition = recognition;
    this.gotFinal = false;
    const started = recognition.start({
      onError: (reason) => {
        if (this.recognition !== recognition) return;
        this.disable();
        logLifecycle('session.recognition-error', 'microphone off; reason: ' + (reason ?? 'unknown'));
        this.hooks.onRecognitionError?.(reason);
      },
      onStarted: () => {
        if (this.recognition === recognition && !this.speakingNow && !this.hooks.isSpeaking()) this.cue('start');
      },
      onTranscript: (text, isFinal) => {
        // Browser callbacks may arrive after cancellation, navigation, or a
        // newer recognition attempt. Only the active recognizer may speak.
        if (this.recognition !== recognition || this.gotFinal) return;
        if (!isFinal) { this.hooks.onPartial?.(text); return; }
        if (this.speakingNow || this.hooks.isSpeaking()) {
          // Defence in depth: a stale recogniser delivering during
          // TieSua's speech can only be echo. Never dispatched.
          logLifecycle('session.drop-during-speech', text.slice(0, 60));
          return;
        }
        this.gotFinal = true;
        this.listeningNow = false;
        this.recognition = null;
        this.cue('end');
        void this.dispatch(text);
      },
      onEnd: () => {
        if (this.recognition !== recognition) return;
        const wasListening = this.listeningNow;
        this.listeningNow = false;
        if (this.recognition === recognition) this.recognition = null;
        if (!wasListening || this.gotFinal || !this.enabled) return;
        // Recognition ended with nothing: back off, then dormancy.
        this.emptyRestarts += 1;
        if (this.emptyRestarts > MAX_EMPTY_RESTARTS) {
          this.cue('end');
          this.dormant = true;
          logLifecycle('session.dormant', 'recognition auto-restart suspended after repeated empty results');
          this.emit('idle');
          return;
        }
        this.scheduleListen(800);
      },
    });
    if (this.recognition !== recognition) return; // A synchronous error or cancellation already ended this attempt.
    if (started) {
      this.listeningNow = true;
      logLifecycle('session.listen-start', '');
      this.emit('listening');
    } else {
      this.recognition = null;
      this.cue('end');
      if (this.enabled) { this.dormant = true; logLifecycle('session.recognition-unavailable', 'recognition could not start'); this.emit('idle'); }
    }
  }

  private async dispatch(text: string): Promise<void> {
    if (this.processing) return; // exactly one dispatch at a time
    this.processing = true;
    logLifecycle('session.dispatch', 'one final learner utterance');
    this.hooks.onPartial?.('');
    this.emit('thinking');
    try {
      await this.hooks.onUtterance(text);
    } catch { /* screen handlers report their own failures */ }
    this.processing = false;
    if (!this.enabled) { this.emit('off'); return; }
    if (this.speakingNow || this.hooks.isSpeaking()) this.emit('speaking');
    else this.scheduleListen(0);
  }
}
