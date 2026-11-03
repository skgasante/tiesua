/** Intent layer between speech/typing and the mathematics.
 * Navigation and help commands are recognised deterministically and
 * never reach the verifier as mathematics. Everything else is
 * returned untouched for the learner to confirm or correct before
 * submission — transcripts are never auto-submitted. */

export type LearnerCommand =
  | 'repeat-problem' | 'repeat-current' | 'explain-step' | 'hint'
  | 'speak-slower' | 'stop-speaking' | 'restart';

export type LearnerIntent =
  | { type: 'command'; command: LearnerCommand }
  | { type: 'input'; text: string };

const RULES: { command: LearnerCommand; patterns: RegExp[] }[] = [
  { command: 'stop-speaking', patterns: [/^stop( speaking)?$/, /^be quiet$/, /^quiet$/] },
  { command: 'speak-slower', patterns: [/speak slower/, /talk slower/, /^slower( please)?$/] },
  { command: 'repeat-problem', patterns: [/repeat (the )?(question|problem)/, /^hear the (question|problem) again$/] },
  { command: 'repeat-current', patterns: [/repeat (that|the current step|current step)/, /^hear (that|it) again$/, /^repeat$/] },
  { command: 'explain-step', patterns: [/explain( that| this| the)?( step)?/, /^why( did| do)?\b/] },
  { command: 'hint', patterns: [/give me a hint/, /^hint( please)?$/, /i am stuck/, /i'?m stuck/, /^help me$/] },
  { command: 'restart', patterns: [/^start again$/, /^restart$/, /new problem/] },
];

export function classifyIntent(raw: string): LearnerIntent {
  const text = raw.trim();
  const normalised = text.toLowerCase().replace(/[.!?,]+$/g, '').replace(/\s+/g, ' ').trim();
  for (const rule of RULES) {
    if (rule.patterns.some((p) => p.test(normalised))) {
      return { type: 'command', command: rule.command };
    }
  }
  return { type: 'input', text };
}
