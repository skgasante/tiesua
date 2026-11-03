export type StepTurn = { learner: string; tutor: string; assessment: string | null };

/** Short-lived evidence for one displayed teaching question, never mathematical truth. */
export class StepConversation {
  private key = '';
  private turns: StepTurn[] = [];
  private stalled = 0;

  context(key: string) {
    if (key !== this.key) { this.key = key; this.turns = []; this.stalled = 0; }
    return { recent_turns: this.turns.map(turn => ({ ...turn })), answers_without_progress: this.stalled };
  }

  record(key: string, learner: string, tutor: string, assessment: string | null, answer: boolean) {
    this.context(key);
    if (answer) this.stalled = assessment === 'correct' ? 0 : this.stalled + 1;
    this.turns.push({ learner: learner.slice(0, 180), tutor: tutor.slice(0, 160), assessment });
    this.turns = this.turns.slice(-3);
  }
}
