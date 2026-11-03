/** Conversation-turn contract (shared, frontend-enforced).
 *
 * Every AI teaching response must lead somewhere: await the
 * learner, continue teaching, or close. The backend declares
 * `continuation` when it is current; older backends may omit it.
 * The runner enforces state-bearing transitions. responsePrompt supplies the
 * current question at model-speaking exits when a response has no task.
 * A bare explanation alone never authorizes progression or another API call. */

export type Continuation = 'await-response' | 'teach-next' | 'close';

/** Conservative safety fallback when the learner explicitly asks for time. */
export function requestsThinkingTime(text: string): boolean {
  const t = text.trim().toLowerCase();
  if (/\b(?:not|don't|do not|never|no longer)\b/.test(t)) return false;
  return /\b(?:hang on|hold on|wait a (?:moment|minute|bit)|give me (?:a moment|a minute|some time)|(?:i need|i want|can i have|give me) (?:a bit |a little |some |a lot )?more time|(?:let me|i need to) think|i(?:'m| am) (?:still )?thinking)\b/.test(t);
}

/** Tutor speech repair is an interaction notice, not new teaching content. */
export function isSpeechRepairNotice(text: string): boolean {
  return /^i (?:didn['’]t|did not|couldn['’]t|could not)\b[^.!?]*(?:hear|catch|get|understand)\b/i.test(text.trim())
    || /^(?:could|can|would) you (?:please )?(?:say that again|repeat that|come again)\b/i.test(text.trim());
}

/** Generic repair questions must not erase an active teaching task. */
export function isGenericClarification(text: string): boolean {
  return /^(?:what (?:would you like|do you want) to do(?: next)?|how can I help(?: you)?|what would you like(?: next)?)\s*[?.!]*$/i.test(text.trim());
}

const QUESTION_MOVES = new Set([
  'guided-example', 'independent-practice', 'ask-check', 'explain-prerequisite', 'hint',
]);

export function deriveContinuation(plan: {
  continuation?: string;
  teachingMove?: string;
  reply?: string;
  actions?: unknown[];
}, stage: string): Continuation {
  if (plan.continuation === 'await-response' || plan.continuation === 'teach-next' || plan.continuation === 'close') {
    return plan.continuation;
  }
  if (stage === 'complete') return 'close';
  const move = plan.teachingMove ?? 'none';
  if (QUESTION_MOVES.has(move)) return 'await-response';
  if ((plan.reply ?? '').trim().endsWith('?')) return 'await-response';
  return 'teach-next';
}

/** A reply never authorizes a second paid request. Stage transitions are
 * completed locally with registered choices after the first reply finishes. */
export function shouldAutoContinue(_args: {
  continuation: Continuation;
  actionsExecuted: number;
  alreadyAutoContinued: boolean;
  stage: string;
}): boolean {
  return false;
}


/** A single contextual invitation when a teaching reply would otherwise end
 * with no next action. The question comes from the actual learning state. */
export function teachingFollowUp(context: {
  stage: string; pendingOperation?: string | null; currentQuestion?: string; actionType?: string;
}): string | null {
  if (context.stage === 'intro') return 'When you are ready, say continue, or ask me a question.';
  if (context.pendingOperation) return 'What equation do you get after doing that to both sides?';
  if (context.actionType === 'resulting_equation') return 'What would you try next to get x on its own?';
  if (['guided', 'independent', 'example-check'].includes(context.stage) && context.currentQuestion) return context.currentQuestion;
  return null;
}
