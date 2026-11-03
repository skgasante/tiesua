/** Development-only decision trace.
 *
 * Purpose: make one learner turn inspectable — which layer decided
 * what happened (local rule, fixed lesson transition, verifier, or a
 * genuine Meta proposal), whether Meta was actually called, which
 * registry actions executed, and where the spoken reply came from.
 *
 * Privacy and safety rules:
 * - In-memory only. Nothing is persisted, sent over the network, or
 *   written to localStorage. A page refresh clears it.
 * - Learner input is stored only as a short preview (60 chars) plus
 *   its length — enough to debug routing, not a transcript log.
 * - No prompts, no model internals, no credentials, no full model
 *   output text.
 * - Disabled unless explicitly enabled: Vite dev mode, or
 *   localStorage 'tiesua-dev-trace' = '1' on the learner's own
 *   device (the flag only — never trace contents — touches storage).
 * - Never rendered in the learner interface. Inspect in dev tools:
 *   `window.__tiesuaTurnTraces?.()` returns a copy of recent turns.
 */

export type ReplyOrigin =
  | 'predefined' // fixed lesson content read aloud (intro/example/teach lines)
  | 'templated' // locally composed from verified facts or lesson fields
  | 'verifier' // backend verifier message
  | 'live-meta' // genuinely model-generated text
  | 'fallback-scripted' // honestly labelled scripted fallback
  | 'mock' // test-only mock
  | 'none';

export type NextStateChosenBy =
  | 'fixed-transition' // stage machine advanced by rule (intro -> example -> practice)
  | 'local-rule' // deterministic local intent / routing decision
  | 'meta-proposal' // Meta proposed an action that validation executed
  | 'verifier' // verified mathematical state determined what happens next
  | 'learner' // learner explicitly chose (guided vs independent, topic, ...)
  | 'none';

export interface TurnTrace {
  at: string;
  screen: 'home' | 'lesson' | 'other';
  lessonId?: string;
  stage?: string;
  inputPreview: string;
  inputLength: number;
  interpretedBy: 'local' | 'meta' | 'local+meta' | 'none';
  metaCalled: boolean;
  /** Short machine-readable decision, e.g. 'open-lesson',
   * 'fraction-answer-correct', 'tutor-feedback'. */
  decision: string;
  actionsExecuted: string[];
  replyOrigin: ReplyOrigin;
  verification: { involved: boolean; verdict?: string; actionType?: string };
  nextStateChosenBy: NextStateChosenBy;
  nextStage?: string;
}

const MAX_TURNS = 50;
const turns: TurnTrace[] = [];
let forcedEnabled: boolean | null = null;

/** Test/owner override. Production builds stay off unless the
 * learner's own browser has the dev flag set. */
export function setDecisionTraceEnabled(enabled: boolean | null): void {
  forcedEnabled = enabled;
  exposeWindowReader();
}

export function decisionTraceEnabled(): boolean {
  if (forcedEnabled !== null) return forcedEnabled;
  try {
    if ((import.meta as { env?: { DEV?: boolean } }).env?.DEV) return true;
  } catch { /* non-Vite context */ }
  try {
    return globalThis.localStorage?.getItem('tiesua-dev-trace') === '1';
  } catch {
    return false;
  }
}

function exposeWindowReader(): void {
  try {
    const w = globalThis as unknown as { __tiesuaTurnTraces?: () => TurnTrace[] };
    if (decisionTraceEnabled()) {
      w.__tiesuaTurnTraces = () => getTurnTraces();
    } else {
      delete w.__tiesuaTurnTraces;
    }
  } catch { /* no window (tests, SSR) */ }
}

/** Record one learner turn. No-op when tracing is disabled. */
export function recordTurn(trace: Omit<TurnTrace, 'at'>): void {
  if (!decisionTraceEnabled()) return;
  turns.push({ ...trace, at: new Date().toISOString() });
  if (turns.length > MAX_TURNS) turns.splice(0, turns.length - MAX_TURNS);
  exposeWindowReader();
}

/** Recent turns, oldest first. Returns copies — callers cannot
 * mutate the stored trace. */
export function getTurnTraces(): TurnTrace[] {
  return turns.map((t) => ({ ...t, actionsExecuted: [...t.actionsExecuted], verification: { ...t.verification } }));
}

export function clearTurnTraces(): void {
  turns.length = 0;
}

/** Short, privacy-bounded preview of learner input. */
export function previewInput(text: string): { inputPreview: string; inputLength: number } {
  const clean = text.replace(/\s+/g, ' ').trim();
  return { inputPreview: clean.slice(0, 60), inputLength: clean.length };
}
