/** Browser speech recognition behind the same provider philosophy
 * as speech output: capability-detected, replaceable, never assumed.
 * The browser API accepts no mathematical vocabulary hints and is
 * not assumed to work offline — transcripts are therefore placed in
 * the answer box for the learner to check and correct before any
 * verification. Typed input is always an equal path. */

interface RecognitionAlternativeLike { transcript: string }
interface RecognitionResultLike { isFinal: boolean; 0: RecognitionAlternativeLike }
interface RecognitionEventLike { results: ArrayLike<RecognitionResultLike> }
interface RecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((event: RecognitionEventLike) => void) | null;
  onstart: (() => void) | null;
  onerror: ((event?: { error?: string }) => void) | null;
  onend: (() => void) | null;
}

export function recognitionSupported(): boolean {
  if (typeof window === 'undefined') return false;
  const w = window as unknown as Record<string, unknown>;
  return typeof w.SpeechRecognition === 'function' || typeof w.webkitSpeechRecognition === 'function';
}

export class BrowserRecognition {
  private recognition: RecognitionLike | null = null;
  private finishTimer: ReturnType<typeof setTimeout> | null = null;

  start(callbacks: { onTranscript: (text: string, isFinal: boolean) => void; onEnd: () => void; onStarted?: () => void; onError?: (reason?: string) => void }): boolean {
    if (!recognitionSupported()) return false;
    const w = window as unknown as Record<string, new () => RecognitionLike>;
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    const rec = new Ctor();
    rec.lang = 'en-GH';
    rec.interimResults = true;
    rec.continuous = true;
    rec.onstart = () => { if (this.recognition === rec) callbacks.onStarted?.(); };
    let transcript = '';
    let delivered = false;
    const finish = () => {
      if (delivered || this.recognition !== rec || !transcript.trim()) return;
      delivered = true;
      if (this.finishTimer) clearTimeout(this.finishTimer);
      rec.onend = null;
      rec.onerror = null;
      try { rec.stop(); } catch { /* already stopped */ }
      callbacks.onTranscript(transcript.trim(), true);
    };
    rec.onresult = (event) => {
      if (delivered || this.recognition !== rec) return;
      if (this.finishTimer) clearTimeout(this.finishTimer);
      const parts: string[] = [];
      let final = true;
      for (let i = 0; i < event.results.length; i++) {
        const result = event.results[i];
        parts.push(result[0].transcript);
        final = final && result.isFinal;
      }
      transcript = parts.join(' ');
      callbacks.onTranscript(transcript, false);
      let quietSeconds = 2;
      try {
        const saved = Number(localStorage.getItem('tiesua-listening-quiet-seconds'));
        if ([2, 3, 5, 8].includes(saved)) quietSeconds = saved;
      } catch { /* use the default */ }
      if (final) this.finishTimer = setTimeout(finish, quietSeconds * 1000);
    };
    rec.onerror = event => {
      if (this.recognition !== rec || delivered) return;
      if (event?.error && !['no-speech', 'aborted'].includes(event.error)) {
        rec.onend = null;
        if (this.finishTimer) clearTimeout(this.finishTimer);
        if (callbacks.onError) callbacks.onError(event.error); else callbacks.onEnd();
      } else callbacks.onEnd();
    };
    rec.onend = () => { if (transcript.trim()) finish(); else callbacks.onEnd(); };
    this.recognition = rec;
    try { rec.start(); return true; } catch { return false; }
  }

  stop(): void {
    if (this.finishTimer) clearTimeout(this.finishTimer);
    if (this.recognition) { this.recognition.onend = null; this.recognition.onerror = null; }
    try { this.recognition?.stop(); } catch { /* already stopped */ }
    this.recognition = null;
  }
}
