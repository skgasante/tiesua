/** Short, distinct cues. Audio is optional: unsupported or blocked audio
 * must never prevent microphone use. */
export class ListeningCue {
  private context: AudioContext | null = null;
  unlock(): void {
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume().catch(() => undefined);
    } catch { /* audio unavailable */ }
  }
  play(kind: 'start' | 'end'): void {
    try {
      const ctx = this.context;
      if (!ctx || ctx.state !== 'running') return;
      const oscillator = ctx.createOscillator(); const gain = ctx.createGain();
      const now = ctx.currentTime;
      oscillator.type = 'sine'; oscillator.frequency.value = kind === 'start' ? 740 : 440;
      gain.gain.setValueAtTime(0.0001, now); gain.gain.exponentialRampToValueAtTime(0.24, now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
      oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(now); oscillator.stop(now + 0.21);
    } catch { /* audio unavailable */ }
  }
}
